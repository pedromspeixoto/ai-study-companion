import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, ilike, or, asc } from "drizzle-orm";
import { ChatSDKError } from "@/lib/errors";
import { resources, type ResourceStatus } from "@/lib/db/resources/schema";
import { eq } from "drizzle-orm";

// TODO: Use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);


export async function findResourceById(
  id: string,
): Promise<typeof resources.$inferSelect | undefined> {
  try {
    const [row] = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to query resource");
  }
}

export async function deleteResourceById(id: string): Promise<void> {
  try {
    await db.delete(resources).where(eq(resources.id, id));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to delete resource");
  }
}

export async function getResourcesPaginated({
  page = 1,
  limit = 50,
  search = "",
}: {
  page?: number;
  limit?: number;
  search?: string;
} = {}): Promise<{
  resources: typeof resources.$inferSelect[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}> {
  try {
    const offset = (page - 1) * limit;
    const maxLimit = Math.min(limit, 50); // Maximum 50 per page
    
    // Build search condition
    const searchCondition = search
      ? or(
          ilike(resources.filename, `%${search}%`),
          ilike(resources.folder, `%${search}%`)
        )
      : undefined;
    
    const query = db
      .select()
      .from(resources)
      .orderBy(asc(resources.folder), asc(resources.filename));
    
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(resources);
    
    if (searchCondition) {
      query.where(searchCondition);
      countQuery.where(searchCondition);
    }
    
    const [rows, countResult] = await Promise.all([
      query.limit(maxLimit).offset(offset),
      countQuery
    ]);
    
    const total = countResult[0]?.count || 0;
    const totalPages = Math.ceil(total / maxLimit);
    
    return {
      resources: rows,
      total,
      totalPages,
      currentPage: page,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to query resources");
  }
}

/**
 * Get resources grouped by folder
 */
export async function getResourcesGroupedByFolder({
  search = "",
}: {
  search?: string;
} = {}): Promise<Record<string, typeof resources.$inferSelect[]>> {
  try {
    const searchCondition = search
      ? or(
          ilike(resources.filename, `%${search}%`),
          ilike(resources.folder, `%${search}%`)
        )
      : undefined;
    
    const query = db
      .select()
      .from(resources)
      .orderBy(asc(resources.folder), asc(resources.filename));
    
    if (searchCondition) {
      query.where(searchCondition);
    }
    
    const rows = await query;
    
    // Group by folder
    const grouped: Record<string, typeof resources.$inferSelect[]> = {};
    for (const resource of rows) {
      const folder = resource.folder || "Other";
      if (!grouped[folder]) {
        grouped[folder] = [];
      }
      grouped[folder].push(resource);
    }
    
    return grouped;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to query resources");
  }
}