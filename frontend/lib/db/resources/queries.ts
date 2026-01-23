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
 * Get resources grouped by folder with pagination
 */
export async function getResourcesGroupedByFolder({
  search = "",
  folderPage = 1,
  foldersPerPage = 10,
  filesPerFolder = 50,
}: {
  search?: string;
  folderPage?: number;
  foldersPerPage?: number;
  filesPerFolder?: number;
} = {}): Promise<{
  folders: Record<string, typeof resources.$inferSelect[]>;
  totalFolders: number;
  totalResources: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}> {
  try {
    const searchCondition = search
      ? or(
          ilike(resources.filename, `%${search}%`),
          ilike(resources.folder, `%${search}%`)
        )
      : undefined;

    // Get all resources to group them
    const query = db
      .select()
      .from(resources)
      .orderBy(asc(resources.folder), asc(resources.filename));

    if (searchCondition) {
      query.where(searchCondition);
    }

    const rows = await query;

    // Group by folder
    const allGrouped: Record<string, typeof resources.$inferSelect[]> = {};
    for (const resource of rows) {
      const folder = resource.folder || "Other";
      if (!allGrouped[folder]) {
        allGrouped[folder] = [];
      }
      allGrouped[folder].push(resource);
    }

    // Get sorted folder names
    const allFolderNames = Object.keys(allGrouped).sort();
    const totalFolders = allFolderNames.length;
    const totalPages = Math.ceil(totalFolders / foldersPerPage);

    // Paginate folders
    const startIdx = (folderPage - 1) * foldersPerPage;
    const endIdx = startIdx + foldersPerPage;
    const paginatedFolderNames = allFolderNames.slice(startIdx, endIdx);

    // Build paginated result with file limits
    const folders: Record<string, typeof resources.$inferSelect[]> = {};
    for (const folderName of paginatedFolderNames) {
      // Limit files per folder if specified
      folders[folderName] = allGrouped[folderName].slice(0, filesPerFolder);
    }

    return {
      folders,
      totalFolders,
      totalResources: rows.length,
      currentPage: folderPage,
      totalPages,
      hasNextPage: folderPage < totalPages,
      hasPrevPage: folderPage > 1,
    };
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to query resources");
  }
}

/**
 * Get all unique folder names
 */
export async function getAllFolders(): Promise<string[]> {
  try {
    const result = await db
      .selectDistinct({ folder: resources.folder })
      .from(resources)
      .orderBy(asc(resources.folder));

    return result.map(r => r.folder || "Other");
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to query folders");
  }
}