import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, cosineDistance, sql, desc, asc, gt, and } from "drizzle-orm";
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
 * The new embedding type
 * @returns The new embedding type
 */
export type NewEmbedding = {
  resourceId: string;
  content: string;
  embedding: number[];
};

/**
 * The result of the similarity search
 * @returns The result of the similarity search
 */
export type SimilaritySearchResult = {
  content: string;
  similarity: number;
  resourceName: string | null;
};

/**
 * Save embeddings to the database
 * Note: This function is kept for external use (e.g., Dagster pipeline).
 * The frontend no longer generates embeddings - that is handled by Dagster.
 * @param values - The embeddings to save
 * @returns The number of saved embeddings
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
 * @returns The number of deleted embeddings
 */
export async function deleteEmbeddingsByResourceId(resourceId: string): Promise<void> {
  try {
    await db.delete(embeddings).where(eq(embeddings.resourceId, resourceId));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to delete embeddings");
  }
}

/**
 * Find relevant content from all embeddings
 * @param userQueryEmbedded - The user query embedding
 * @returns The relevant content
 */
export const findRelevantContent = async (userQueryEmbedded: number[]): Promise<SimilaritySearchResult[]> => {
    const similarity = sql<number>`1 - (${cosineDistance(
      embeddings.embedding,
      userQueryEmbedded,
    )})`;
    const similarGuides = await db
      .select({ 
        content: embeddings.content, 
        similarity,
        resourceName: resources.filename,
      })
      .from(embeddings)
      .leftJoin(resources, eq(embeddings.resourceId, resources.id))
      .where(gt(similarity, SIMILARITY_THRESHOLD))
      .orderBy(desc(similarity))
      .limit(4);
    
    console.log(`[findRelevantContent] Found ${similarGuides.length} results`);
    return similarGuides;
};


/**
 * Find relevant content from an embeddings by resource id
 * @param userQueryEmbedded - The user query embedding
 * @param resourceId - The resource id
 * @returns The relevant content
 */
export const findRelevantContentByResourceId = async (userQueryEmbedded: number[], resourceId: string): Promise<SimilaritySearchResult[]> => {
    const similarity = sql<number>`1 - (${cosineDistance(
      embeddings.embedding,
      userQueryEmbedded,
    )})`;
    const similarGuides = await db
      .select({ 
        content: embeddings.content, 
        similarity,
        resourceName: resources.filename,
      })
      .from(embeddings)
      .leftJoin(resources, eq(embeddings.resourceId, resources.id))
      .where(and(eq(embeddings.resourceId, resourceId), gt(similarity, SIMILARITY_THRESHOLD)))
      .orderBy(desc(similarity))
      .limit(4);
    
    console.log(`[findRelevantContentByResourceId] Found ${similarGuides.length} results for resource ${resourceId}`);
    return similarGuides;
};

/**
 * Get all content chunks for a resource (for preview)
 * @param resourceId - The resource id
 * @returns Array of content strings
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
