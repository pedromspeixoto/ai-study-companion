import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, cosineDistance, sql, desc, asc, gt, and, inArray } from "drizzle-orm";
import { ChatSDKError } from "@/lib/errors";
import { embeddings } from "@/lib/db/embeddings/schema";
import { resources } from "@/lib/db/resources/schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * Minimum similarity threshold for embedding search results.
 * Lower values (e.g., 0.15) will return more results but may include less relevant content.
 * Higher values (e.g., 0.3) will return fewer but more relevant results.
 */
const SIMILARITY_THRESHOLD = 0.3;

/**
 * Default number of results to return from similarity search.
 */
const DEFAULT_LIMIT = 6;

/**
 * The new embedding type
 */
export type NewEmbedding = {
  resourceId: string;
  content: string;
  embedding: number[];
};

/**
 * The result of the similarity search
 */
export type SimilaritySearchResult = {
  content: string;
  similarity: number;
  resourceName: string | null;
  folder: string | null;
  chunkIndex: number | null;
};

/**
 * Options for similarity search
 */
export type SimilaritySearchOptions = {
  limit?: number;
  threshold?: number;
};

/**
 * Save embeddings to the database
 * Note: This function is kept for external use (e.g., Dagster pipeline).
 * The frontend no longer generates embeddings - that is handled by Dagster.
 * @param values - The embeddings to save
 */
export async function saveEmbeddings(values: NewEmbedding[]): Promise<void> {
  if (values.length === 0) return;
  try {
    console.log(`Attempting to save ${values.length} embeddings to database`);
    await db.insert(embeddings).values(values);
    console.log(`Successfully saved ${values.length} embeddings to database`);
  } catch (error) {
    console.error(`Database error saving ${values.length} embeddings:`, error);
    throw new ChatSDKError("bad_request:database", `Failed to save embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete embeddings by resource id
 * @param resourceId - The resource id
 */
export async function deleteEmbeddingsByResourceId(resourceId: string): Promise<void> {
  try {
    await db.delete(embeddings).where(eq(embeddings.resourceId, resourceId));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to delete embeddings");
  }
}

/**
 * Delete all embeddings for resources in a specific folder
 * @param folder - The folder name
 * @returns Number of embeddings deleted
 */
export async function deleteEmbeddingsByFolder(folder: string): Promise<number> {
  try {
    // First, get all resource IDs in this folder
    const resourcesInFolder = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.folder, folder));

    if (resourcesInFolder.length === 0) {
      return 0;
    }

    const resourceIds = resourcesInFolder.map(r => r.id);

    // Delete all embeddings for these resources
    const result = await db
      .delete(embeddings)
      .where(inArray(embeddings.resourceId, resourceIds));

    // Note: Drizzle doesn't return count directly, so we estimate
    return resourceIds.length;
  } catch (error) {
    console.error("Failed to delete embeddings by folder:", error);
    throw new ChatSDKError("bad_request:database", "Failed to delete embeddings by folder");
  }
}

/**
 * Delete all resources and their embeddings for a specific folder
 * @param folder - The folder name
 * @returns Object with counts of deleted resources and embeddings
 */
export async function deleteResourcesByFolder(folder: string): Promise<{ resourceCount: number }> {
  try {
    // Get count first
    const resourcesInFolder = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.folder, folder));

    const resourceCount = resourcesInFolder.length;

    if (resourceCount === 0) {
      return { resourceCount: 0 };
    }

    // Delete resources (embeddings will cascade due to FK constraint)
    await db.delete(resources).where(eq(resources.folder, folder));

    return { resourceCount };
  } catch (error) {
    console.error("Failed to delete resources by folder:", error);
    throw new ChatSDKError("bad_request:database", "Failed to delete resources by folder");
  }
}

/**
 * Find relevant content from all embeddings
 * Uses cosine similarity with HNSW index for fast approximate nearest neighbor search.
 *
 * @param userQueryEmbedded - The user query embedding (1536 dimensions)
 * @param options - Search options (limit, threshold)
 * @returns Array of similar content with metadata
 */
export const findRelevantContent = async (
  userQueryEmbedded: number[],
  options: SimilaritySearchOptions = {}
): Promise<SimilaritySearchResult[]> => {
  const { limit = DEFAULT_LIMIT, threshold = SIMILARITY_THRESHOLD } = options;

  // Cosine similarity = 1 - cosine_distance
  // Range: -1 to 1, where 1 means identical vectors
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;

  const results = await db
    .select({
      content: embeddings.content,
      similarity,
      resourceName: resources.filename,
      folder: resources.folder,
      chunkIndex: embeddings.chunkIndex,
    })
    .from(embeddings)
    .leftJoin(resources, eq(embeddings.resourceId, resources.id))
    .where(gt(similarity, threshold))
    .orderBy(desc(similarity))
    .limit(limit);

  console.log(`[findRelevantContent] Found ${results.length} results (threshold: ${threshold}, limit: ${limit})`);
  return results;
};

/**
 * Find relevant content from embeddings filtered by resource id
 *
 * @param userQueryEmbedded - The user query embedding
 * @param resourceId - The resource id to filter by
 * @param options - Search options
 * @returns Array of similar content
 */
export const findRelevantContentByResourceId = async (
  userQueryEmbedded: number[],
  resourceId: string,
  options: SimilaritySearchOptions = {}
): Promise<SimilaritySearchResult[]> => {
  const { limit = DEFAULT_LIMIT, threshold = SIMILARITY_THRESHOLD } = options;

  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;

  const results = await db
    .select({
      content: embeddings.content,
      similarity,
      resourceName: resources.filename,
      folder: resources.folder,
      chunkIndex: embeddings.chunkIndex,
    })
    .from(embeddings)
    .leftJoin(resources, eq(embeddings.resourceId, resources.id))
    .where(and(
      eq(embeddings.resourceId, resourceId),
      gt(similarity, threshold)
    ))
    .orderBy(desc(similarity))
    .limit(limit);

  console.log(`[findRelevantContentByResourceId] Found ${results.length} results for resource ${resourceId}`);
  return results;
};

/**
 * Find relevant content from embeddings filtered by folder
 *
 * @param userQueryEmbedded - The user query embedding
 * @param folder - The folder to filter by
 * @param options - Search options
 * @returns Array of similar content
 */
export const findRelevantContentByFolder = async (
  userQueryEmbedded: number[],
  folder: string,
  options: SimilaritySearchOptions = {}
): Promise<SimilaritySearchResult[]> => {
  const { limit = DEFAULT_LIMIT, threshold = SIMILARITY_THRESHOLD } = options;

  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;

  const results = await db
    .select({
      content: embeddings.content,
      similarity,
      resourceName: resources.filename,
      folder: resources.folder,
      chunkIndex: embeddings.chunkIndex,
    })
    .from(embeddings)
    .leftJoin(resources, eq(embeddings.resourceId, resources.id))
    .where(and(
      eq(resources.folder, folder),
      gt(similarity, threshold)
    ))
    .orderBy(desc(similarity))
    .limit(limit);

  console.log(`[findRelevantContentByFolder] Found ${results.length} results for folder ${folder}`);
  return results;
};

/**
 * Get all content chunks for a resource (for preview)
 * @param resourceId - The resource id
 * @returns Array of content strings in order
 */
export async function getAllContentByResourceId(resourceId: string): Promise<string[]> {
  try {
    const chunks = await db
      .select({
        content: embeddings.content,
      })
      .from(embeddings)
      .where(eq(embeddings.resourceId, resourceId))
      .orderBy(
        sql`COALESCE(${embeddings.chunkIndex}, 0)`,
        asc(embeddings.id)
      );
    return chunks.map(c => c.content);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to query embeddings");
  }
}

/**
 * Get embedding statistics
 * @returns Stats about embeddings in the database
 */
export async function getEmbeddingStats(): Promise<{
  totalEmbeddings: number;
  totalResources: number;
  byFolder: Record<string, number>;
}> {
  try {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(embeddings);

    const [resourceResult] = await db
      .select({ count: sql<number>`count(DISTINCT ${embeddings.resourceId})` })
      .from(embeddings);

    const folderStats = await db
      .select({
        folder: resources.folder,
        count: sql<number>`count(${embeddings.id})`,
      })
      .from(embeddings)
      .leftJoin(resources, eq(embeddings.resourceId, resources.id))
      .groupBy(resources.folder);

    const byFolder: Record<string, number> = {};
    for (const stat of folderStats) {
      byFolder[stat.folder || "Unknown"] = stat.count;
    }

    return {
      totalEmbeddings: totalResult?.count || 0,
      totalResources: resourceResult?.count || 0,
      byFolder,
    };
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get embedding stats");
  }
}
