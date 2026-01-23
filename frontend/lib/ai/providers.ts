import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { customProvider } from "ai";

/**
 * Custom provider that maps model IDs to their implementations.
 *
 * Model ID mappings:
 * OpenAI:
 * - "openai-gpt-4o" → gpt-4o
 * - "openai-gpt-4o-mini" → gpt-4o-mini
 * - "openai-gpt-4-turbo" → gpt-4-turbo
 *
 * Anthropic:
 * - "anthropic-claude-sonnet" → claude-3-5-sonnet-latest
 * - "anthropic-claude-haiku" → claude-3-5-haiku-latest
 * - "anthropic-claude-opus" → claude-3-opus-latest
 *
 * Utility:
 * - "title-model-openai" → gpt-4o-mini (for generating chat titles)
 * - "title-model-anthropic" → claude-3-5-haiku-latest (for generating chat titles)
 */
export const myProvider = customProvider({
  languageModels: {
    // OpenAI Models
    "openai-gpt-4o": openai("gpt-4o"),
    "openai-gpt-4o-mini": openai("gpt-4o-mini"),
    "openai-gpt-4-turbo": openai("gpt-4-turbo"),

    // Anthropic Models
    "anthropic-claude-sonnet": anthropic("claude-3-5-sonnet-latest"),
    "anthropic-claude-haiku": anthropic("claude-3-5-haiku-latest"),
    "anthropic-claude-opus": anthropic("claude-3-opus-latest"),

    // Utility models for generating titles (fast, cheap models)
    "title-model-openai": openai("gpt-4o-mini"),
    "title-model-anthropic": anthropic("claude-3-5-haiku-latest"),
  },
});

/**
 * Get the title model ID based on the TITLE_PROVIDER environment variable.
 * Defaults to OpenAI since OPENAI_API_KEY is always required for embeddings.
 */
export function getTitleModelId(): string {
  const provider = process.env.TITLE_PROVIDER?.toLowerCase() || "openai";
  return provider === "anthropic" ? "title-model-anthropic" : "title-model-openai";
}

/**
 * Mapping from our custom model IDs to the actual provider model IDs.
 * Used for cost calculation with tokenlens.
 */
const MODEL_ID_MAP: Record<string, string> = {
  // OpenAI
  "openai-gpt-4o": "gpt-4o",
  "openai-gpt-4o-mini": "gpt-4o-mini",
  "openai-gpt-4-turbo": "gpt-4-turbo",
  // Anthropic
  "anthropic-claude-sonnet": "claude-3-5-sonnet-latest",
  "anthropic-claude-haiku": "claude-3-5-haiku-latest",
  "anthropic-claude-opus": "claude-3-opus-latest",
  // Utility
  "title-model-openai": "gpt-4o-mini",
  "title-model-anthropic": "claude-3-5-haiku-latest",
};

/**
 * Get the actual provider model ID from our custom model ID.
 * Used for cost calculation with tokenlens.
 *
 * @param customModelId - Our custom model ID (e.g., "openai-gpt-4o")
 * @returns The actual provider model ID (e.g., "gpt-4o")
 */
export function getActualModelId(customModelId: string): string {
  return MODEL_ID_MAP[customModelId] || customModelId;
}
