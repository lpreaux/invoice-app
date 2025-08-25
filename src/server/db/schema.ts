// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import {
  bigint,
  text,
  int,
  index,
  singlestoreTableCreator,
  timestamp,
} from "drizzle-orm/singlestore-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = singlestoreTableCreator(
  (name) => `INVOICE_APP_${name}`,
);

export const posts = createTable(
  "post",
  {
    id: bigint({ mode: "number", unsigned: true }).primaryKey(),
    name: text(),
    createdAt: timestamp()
      .defaultNow()
      .notNull(),
    updatedAt: timestamp().$onUpdate(() => new Date()),
  },
  (t) => [index("name_idx").on(t.name)],
);
