import { embed } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Embedding model configuration.
 *
 * IMPORTANT: This MUST use OpenAI and match the model used in the Dagster data pipeline.
 * The Dagster pipeline generates embeddings with text-embedding-3-small, so queries
 * must use the same model to ensure vector compatibility.
 *
 * DO NOT change this to use Anthropic or any other provider - embeddings must be
 * consistent between the data pipeline and query generation.
 */
const embeddingModel = openai.embedding("text-embedding-3-small");

/**
 * Generate a single embedding from input text (for query/search purposes)
 * This is used for retrieval - generating embeddings for user queries to search existing document embeddings
 * @param value - The input text (typically a user query)
 * @returns Single embedding vector
 */
export const generateEmbedding = async (value: string): Promise<number[]> => {
  const { embedding } = await embed({
    model: embeddingModel,
    value,
  });
  return embedding;
};
