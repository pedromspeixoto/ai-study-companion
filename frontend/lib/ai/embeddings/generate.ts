import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// IMPORTANT: This must match the model used in the Dagster pipeline
// Dagster uses: text-embedding-3-small
const embeddingModel = openai.embedding('text-embedding-3-small');

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
