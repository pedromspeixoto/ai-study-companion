import { embed } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Embedding model configuration.
 *
 * IMPORTANT RULES:
 * - ALWAYS use Ollama (nomic-embed-text) if OLLAMA_BASE_URL is set
 * - Otherwise, use OpenAI (text-embedding-3-small)
 * - The embedding model MUST match the model used in the Dagster data pipeline
 * - Embeddings must be consistent between the data pipeline and query generation
 *
 * Model specifications:
 * - OpenAI: text-embedding-3-small (1536 dimensions)
 * - Ollama: nomic-embed-text (768 dimensions)
 *
 * Configure via environment variables:
 * - OLLAMA_BASE_URL: Set to use Ollama (e.g., "http://localhost:11434")
 *   When set, ALWAYS uses nomic-embed-text for embeddings (768 dimensions)
 * - OPENAI_API_KEY: Required for OpenAI embeddings (only used if OLLAMA_BASE_URL is not set)
 */
// Always use nomic-embed-text when Ollama is enabled
const OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";

// Get OpenAI embedding model (only used when OLLAMA_BASE_URL is not set)
const getOpenAIEmbeddingModel = () => {
  return openai.embedding("text-embedding-3-small");
};

/**
 * Generate a single embedding from input text (for query/search purposes)
 * This is used for retrieval - generating embeddings for user queries to search existing document embeddings
 * @param value - The input text (typically a user query)
 * @returns Single embedding vector
 */
export const generateEmbedding = async (value: string): Promise<number[]> => {
  const ollamaBaseURL = process.env.OLLAMA_BASE_URL;
  
  // If using Ollama, call the API directly to avoid AI SDK compatibility issues
  if (ollamaBaseURL && ollamaBaseURL.trim()) {
    try {
      console.log("[generateEmbedding] Generating embedding with Ollama API directly:", value.substring(0, 100));
      console.log("[generateEmbedding] OLLAMA_BASE_URL:", ollamaBaseURL);
      
      const response = await fetch(`${ollamaBaseURL.trim()}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_EMBEDDING_MODEL,
          input: value,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      }
      
      const data = await response.json();
      
      // Ollama returns embeddings as an array in "embeddings" field (or "embedding" for single)
      let embedding: number[];
      if (Array.isArray(data.embeddings) && data.embeddings.length > 0) {
        embedding = data.embeddings[0];
      } else if (Array.isArray(data.embedding)) {
        embedding = data.embedding;
      } else {
        throw new Error(`Unexpected Ollama response format. Keys: ${Object.keys(data).join(", ")}`);
      }
      
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(`Invalid embedding format: expected array, got ${typeof embedding}`);
      }
      
      console.log("[generateEmbedding] Successfully generated Ollama embedding with", embedding.length, "dimensions");
      return embedding;
    } catch (error) {
      console.error("[generateEmbedding] Error generating Ollama embedding:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        value: value.substring(0, 100),
        ollamaBaseURL,
      });
      throw error;
    }
  }
  
  // Use AI SDK for OpenAI (works correctly)
  try {
    const embeddingModel = getOpenAIEmbeddingModel();
    console.log("[generateEmbedding] Generating embedding with OpenAI:", value.substring(0, 100));
    
    const result = await embed({
      model: embeddingModel,
      value,
    });
    
    if (!result.embedding) {
      throw new Error(`Embedding generation failed: result.embedding is ${result.embedding}. Result keys: ${Object.keys(result).join(", ")}`);
    }
    
    if (!Array.isArray(result.embedding)) {
      throw new Error(`Embedding is not an array: ${typeof result.embedding}`);
    }
    
    console.log("[generateEmbedding] Successfully generated OpenAI embedding with", result.embedding.length, "dimensions");
    return result.embedding;
  } catch (error) {
    console.error("[generateEmbedding] Error generating OpenAI embedding:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      value: value.substring(0, 100),
    });
    throw error;
  }
};
