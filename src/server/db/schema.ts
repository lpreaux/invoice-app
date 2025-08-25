// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import {
  bigint,
  text,
  int,
  index,
  singlestoreTableCreator,
  timestamp,
  varchar,
  singlestoreEnum,
  date,
  decimal,
} from "drizzle-orm/singlestore-core";
import { relations } from "drizzle-orm";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = singlestoreTableCreator((name) => `INVOICE_APP_${name}`);

// Addresses table - normalized address data
export const addresses = createTable(
  "addresses",
  {
    id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
    street: varchar("street", { length: 255 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    postCode: varchar("post_code", { length: 20 }).notNull(),
    country: varchar("country", { length: 100 }).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (address) => [index("idx_addresses_city_country").on(address.city, address.country)],
);

// Invoices table - main invoice data
export const invoices = createTable(
  "invoices",
  {
    id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
    paymentDue: date("payment_due").notNull(),
    description: text("description").notNull(),
    paymentTerms: int("payment_terms").notNull(),
    clientName: varchar("client_name", { length: 255 }).notNull(),
    clientEmail: varchar("client_email", { length: 255 }).notNull(),
    status: singlestoreEnum("status", ["draft", "pending", "paid"]).notNull().default("draft"),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),

    // Foreign keys to addresses
    senderAddressId: bigint("sender_address_id", { mode: "number", unsigned: true }),
    clientAddressId: bigint("client_address_id", { mode: "number", unsigned: true }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (invoice) => [
    index("idx_invoices_client_email").on(invoice.clientEmail),
    index("idx_invoices_created_at").on(invoice.createdAt),
    index("idx_invoices_payment_due").on(invoice.paymentDue),
    index("idx_invoices_sender_address").on(invoice.senderAddressId),
    index("idx_invoices_client_address").on(invoice.clientAddressId),
  ],
);

// Invoice items table - line items for each invoice
export const invoiceItems = createTable(
  "invoice_items",
  {
    id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
    invoiceId: bigint("invoice_id", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    quantity: int("quantity").notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (invoiceItem) => [index("idx_invoice_items_invoice_id").on(invoiceItem.invoiceId)],
);

// Relations
export const addressesRelations = relations(addresses, ({ many }) => ({
  senderInvoices: many(invoices, { relationName: "senderAddress" }),
  clientInvoices: many(invoices, { relationName: "clientAddress" }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  senderAddress: one(addresses, {
    fields: [invoices.senderAddressId],
    references: [addresses.id],
    relationName: "senderAddress",
  }),
  clientAddress: one(addresses, {
    fields: [invoices.clientAddressId],
    references: [addresses.id],
    relationName: "clientAddress",
  }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

// Types for use in your application
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;

// Complete invoice type with items and addresses
export type InvoiceWithDetails = Invoice & {
  items: InvoiceItem[];
  senderAddress: Address | null;
  clientAddress: Address | null;
};
