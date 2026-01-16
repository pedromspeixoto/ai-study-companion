import { sql } from "drizzle-orm";
import { text, varchar, timestamp, pgTable } from "drizzle-orm/pg-core";
import { nanoid } from "@/lib/utils/embeddings";

export const resources = pgTable("resources", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  filename: text("filename").notNull(),
  folder: text("folder").notNull(),
  pathname: text("pathname").notNull(),
  contentType: text("content_type").notNull(),
  status: varchar("status", { length: 64 }).notNull().default("PROCESSING"),
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`now()`),
});

// Type for resources - used to type API request params and within Components
export type NewResourceParams = Pick<typeof resources.$inferInsert, "filename" | "pathname" | "contentType">;

export const RESOURCE_STATUS = {
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  COMPLETED_WITH_ERRORS: "COMPLETED_WITH_ERRORS",
  FAILED: "FAILED",
} as const;

export type ResourceStatus = typeof RESOURCE_STATUS[keyof typeof RESOURCE_STATUS];