import type { InferSelectModel } from "drizzle-orm";
import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * The user table
 * @returns The user table
 */
export const user = pgTable("users", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

/**
 * The user model
 * @returns The user model
 */
export type User = InferSelectModel<typeof user>;