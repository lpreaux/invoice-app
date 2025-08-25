// Custom error class for referential integrity violations
import { asc, desc, eq, or, sql, isNull, inArray, count } from "drizzle-orm";
import { addresses, invoiceItems, invoices, type InvoiceWithDetails } from "~/server/db/schema";
import type { Db, Transaction } from "~/server/db";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

class ReferentialIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferentialIntegrityError";
  }
}

async function validateAddressExists(tx: Transaction | Db, addressId: number | null, addressType: "sender" | "client") {
  if (!addressId) return true;

  const [address] = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.id, addressId)).limit(1);

  if (!address) {
    throw new ReferentialIntegrityError(`${addressType} address with ID ${addressId} does not exist`);
  }
  return true;
}

async function validateInvoiceExists(tx: Transaction | Db, invoiceId: number) {
  const [invoice] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);

  if (!invoice) {
    throw new ReferentialIntegrityError(`Invoice with ID ${invoiceId} does not exist`);
  }
  return true;
}

async function checkAddressInUse(tx: Transaction | Db, addressId: number) {
  const [usage] = await tx
    .select({ count: count() })
    .from(invoices)
    .where(or(eq(invoices.senderAddressId, addressId), eq(invoices.clientAddressId, addressId)));
  return usage?.count ?? 0 > 0;
}

// Validation schemas
const addressSchema = z.object({
  street: z.string().min(1, "Street is required"),
  postCode: z.string().min(1, "postCode is required"),
  city: z.string().min(1, "City is required"),
  country: z.string().min(1, "Country code is required"),
});

const invoiceItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  quantity: z.number().int().positive("Quantity must be positive"),
  price: z.number().positive("Price must be positive"),
  total: z.number().positive("Total must be positive"),
});

const createInvoiceSchema = z.object({
  paymentDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  description: z.string().min(1, "Description is required"),
  paymentTerms: z.number().int().positive("Payment terms are required"),
  clientName: z.string().min(1, "Client name is required"),
  clientEmail: z.string().email("Invalid email format"),
  status: z.enum(["draft", "pending", "paid"]).default("draft"),
  total: z.number().positive("Total must be positive"),
  senderAddress: addressSchema,
  clientAddress: addressSchema,
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

const updateInvoiceSchema = z.object({
  id: z.number().positive(),
  status: z.enum(["draft", "pending", "paid"]).optional(),
  description: z.string().min(1, "Description is required").optional(),
  paymentTerms: z.number().int().positive("Payment terms are required").optional(),
  clientName: z.string().min(1, "Client name is required").optional(),
  clientEmail: z.string().email("Invalid email format").optional(),
  total: z.number().positive("Total must be positive").optional(),
  senderAddressId: z.number().positive().nullable().optional(),
  clientAddressId: z.number().positive().nullable().optional(),
});

const jsonInvoiceSchema = z.object({
  paymentDue: z.string(),
  description: z.string(),
  paymentTerms: z.number(),
  clientName: z.string(),
  clientEmail: z.string(),
  status: z.enum(["draft", "pending", "paid"]),
  total: z.number(),
  senderAddress: z.object({
    street: z.string(),
    city: z.string(),
    postCode: z.string(),
    country: z.string(),
  }),
  clientAddress: z.object({
    street: z.string(),
    city: z.string(),
    postCode: z.string(),
    country: z.string(),
  }),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      price: z.number(),
      total: z.number(),
    }),
  ),
});

type JsonInvoice = z.infer<typeof jsonInvoiceSchema>;

export const invoicesRouter = createTRPCRouter({
  // Create a new invoice with addresses and items
  create: publicProcedure.input(createInvoiceSchema).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.transaction(async (tx) => {
        // Validate items totals match invoice total
        const calculatedTotal = input.items.reduce((sum, item) => sum + item.total, 0);
        if (Math.abs(calculatedTotal - input.total) > 0.01) {
          throw new Error("Items total does not match invoice total");
        }

        // Create sender address
        const [senderAddress] = await tx.insert(addresses).values(input.senderAddress);

        // Create client address
        const [clientAddress] = await tx.insert(addresses).values(input.clientAddress);

        // Create invoice
        const [invoice] = await tx.insert(invoices).values({
          paymentDue: new Date(input.paymentDue),
          description: input.description,
          paymentTerms: input.paymentTerms,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          status: input.status,
          total: input.total.toString(),
          senderAddressId: senderAddress.insertId,
          clientAddressId: clientAddress.insertId,
        });

        // Create invoice items
        const invoiceItemsData = input.items.map((item) => ({
          invoiceId: invoice.insertId,
          name: item.name,
          quantity: item.quantity,
          price: item.price.toString(),
          total: item.total.toString(),
        }));
        await tx.insert(invoiceItems).values(invoiceItemsData);

        return {
          id: invoice.insertId,
          senderAddressId: senderAddress.insertId,
          clientAddressId: clientAddress.insertId,
        };
      });
    } catch (error) {
      if (error instanceof ReferentialIntegrityError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  // Get all invoices with pagination and filtering
  getAll: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        offset: z.number().min(0).default(0),
        status: z.enum(["draft", "pending", "paid"]).optional(),
        sortBy: z.enum(["createdAt", "paymentDue", "total"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, offset, status, sortBy, sortOrder } = input;

      let query = ctx.db
        .select({ invoice: invoices, senderAddress: addresses })
        .from(invoices)
        .leftJoin(addresses, eq(invoices.senderAddressId, addresses.id))
        .$dynamic();

      if (status) {
        query = query.where(eq(invoices.status, status));
      }

      const sortColumn = invoices[sortBy];
      query = query.orderBy(sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn));

      query = query.limit(limit).offset(offset);
      return await query;
    }),

  // Get a single invoice with all details
  getById: publicProcedure
    .input(z.object({ id: z.number().positive() }))
    .query(async ({ ctx, input }): Promise<InvoiceWithDetails | null> => {
      const [invoice] = await ctx.db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      // Get addresses and items in parallel with integrity checks
      const [senderAddress, clientAddress, items] = await Promise.all([
        invoice.senderAddressId
          ? ctx.db
              .select()
              .from(addresses)
              .where(eq(addresses.id, invoice.senderAddressId))
              .limit(1)
              .then((result) => result[0] ?? null)
          : null,
        invoice.clientAddressId
          ? ctx.db
              .select()
              .from(addresses)
              .where(eq(addresses.id, invoice.clientAddressId))
              .limit(1)
              .then((result) => result[0] ?? null)
          : null,
        ctx.db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, input.id)),
      ]);

      // Validate referential integrity - warn if addresses are missing
      if (invoice.senderAddressId && !senderAddress) {
        console.warn(
          `Orphaned reference: Invoice ${input.id} references missing sender address ${invoice.senderAddressId}`,
        );
      }
      if (invoice.clientAddressId && !clientAddress) {
        console.warn(
          `Orphaned reference: Invoice ${input.id} references missing client address ${invoice.clientAddressId}`,
        );
      }

      return {
        ...invoice,
        items,
        senderAddress,
        clientAddress,
      };
    }),

  // Update invoice with referential integrity checks
  update: publicProcedure.input(updateInvoiceSchema).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.transaction(async (tx) => {
        // Check if invoice exists
        await validateInvoiceExists(tx, input.id);

        // Validate address references if provided
        if (input.senderAddressId !== undefined) {
          await validateAddressExists(tx, input.senderAddressId, "sender");
        }
        if (input.clientAddressId !== undefined) {
          await validateAddressExists(tx, input.clientAddressId, "client");
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, total, ...updateData } = input;

        const [updatedInvoice] = await tx
          .update(invoices)
          .set({
            ...updateData,
            total: total?.toString(),
          })
          .where(eq(invoices.id, input.id));

        return updatedInvoice;
      });
    } catch (error) {
      if (error instanceof ReferentialIntegrityError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  // Delete an invoice with cascade behavior
  delete: publicProcedure.input(z.object({ id: z.number().positive() })).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.transaction(async (tx) => {
        // Get the invoice to find associated addresses
        const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);

        if (!invoice) {
          throw new ReferentialIntegrityError(`Invoice not found`);
        }

        // Delete invoices items (manual cascade)
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));

        // Delete the invoice
        await tx.delete(invoices).where(eq(invoices.id, input.id));

        // Clean up unused addresses (optional - business logic decision)
        if (invoice.senderAddressId) {
          const inUse = await checkAddressInUse(tx, invoice.senderAddressId);
          if (!inUse) {
            await tx.delete(addresses).where(eq(addresses.id, invoice.senderAddressId));
          }
        }
        if (invoice.clientAddressId) {
          const inUse = await checkAddressInUse(tx, invoice.clientAddressId);
          if (!inUse) {
            await tx.delete(addresses).where(eq(addresses.id, invoice.clientAddressId));
          }
        }

        return { success: true };
      });
    } catch (error) {
      if (error instanceof ReferentialIntegrityError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  // Add invoice item with referential integrity
  addItem: publicProcedure
    .input(
      z.object({
        invoiceId: z.number().positive(),
        item: invoiceItemSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.transaction(async (tx) => {
          // Validate invoice exists
          await validateInvoiceExists(tx, input.invoiceId);

          const [newItem] = await tx.insert(invoiceItems).values({
            invoiceId: input.invoiceId,
            name: input.item.name,
            quantity: input.item.quantity,
            price: input.item.price.toString(),
            total: input.item.total.toString(),
          });

          return newItem;
        });
      } catch (error) {
        if (error instanceof ReferentialIntegrityError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  // Delete unused addresses (maintenance procedure)
  cleanupAddresses: publicProcedure.mutation(async ({ ctx }) => {
    return await ctx.db.transaction(async (tx) => {
      // Find addresses not referenced by any invoice
      const unusedAddresses = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .leftJoin(invoices, or(eq(addresses.id, invoices.senderAddressId), eq(addresses.id, invoices.clientAddressId)))
        .where(isNull(invoices.id));

      const deletedCount = unusedAddresses.length;

      if (deletedCount > 0) {
        const addressIds = unusedAddresses.map((address) => address.id);
        await tx.delete(addresses).where(inArray(addresses.id, addressIds));
      }

      return { deletedCount };
    });
  }),

  // Get invoice statistics
  getStats: publicProcedure.query(async ({ ctx }) => {
    const stats = await ctx.db
      .select({
        status: invoices.status,
        count: count(),
        totalAmount: sql<number>`sum(${invoices.total})`,
      })
      .from(invoices)
      .groupBy(invoices.status);

    return stats.reduce(
      (acc, stat) => {
        acc[stat.status] = {
          count: stat.count,
          totalAmount: stat.totalAmount ?? 0,
        };
        return acc;
      },
      {} as Record<string, { count: number; totalAmount: number }>,
    );
  }),
});

// Helper function to transform JSON data to schema format
export function transformJsonToDbFormat(jsonData: unknown) {
  // Runtime validation with Zod
  const data = jsonInvoiceSchema.parse(jsonData);

  return {
    paymentDue: data.paymentDue,
    description: data.description,
    paymentTerms: data.paymentTerms,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    status: data.status,
    total: data.total,
    senderAddress: data.senderAddress,
    clientAddress: data.clientAddress,
    items: data.items,
  };
}
