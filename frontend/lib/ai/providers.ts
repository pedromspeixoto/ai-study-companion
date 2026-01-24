import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { ollama as defaultOllama, createOllama } from "ai-sdk-ollama";
import { customProvider } from "ai";

// ai-sdk-ollama provides better tool calling reliability, error handling, and built-in retries
// It's built on the official Ollama JavaScript client and solves common tool calling issues
// Features: reliable tool calling, web search, automatic JSON repair, enhanced error handling

// Create Ollama provider factory that reads baseURL at runtime
// This is important because Next.js evaluates process.env at build time for client code,
// but server-side code can read process.env at runtime
// We make this a function so it's evaluated when models are actually created/used
const createOllamaProvider = () => {
  // Read from runtime environment (server-side only)
  const baseURL = process.env.OLLAMA_BASE_URL;
  
  // Always use createOllama with explicit baseURL to ensure we use the correct URL
  // If baseURL is set, use it; otherwise defaultOllama will use http://localhost:11434
  if (baseURL && baseURL.trim()) {
    return createOllama({ baseURL: baseURL.trim() });
  }
  // Fallback to defaultOllama (uses http://localhost:11434)
  return defaultOllama;
};

// Create a lazy getter that evaluates the provider when first accessed
// This ensures process.env is read at runtime, not at module load time
let _ollamaProvider: ReturnType<typeof createOllamaProvider> | null = null;
const getOllamaProvider = () => {
  if (!_ollamaProvider) {
    _ollamaProvider = createOllamaProvider();
  }
  return _ollamaProvider;
};

/**
 * Custom provider that maps model IDs to their implementations.
 *
 * IMPORTANT MODEL SELECTION RULES:
 * 1. CHAT MODELS: All models (OpenAI, Anthropic, Ollama) are ALWAYS available for user selection.
 *    - Even if OLLAMA_BASE_URL is set, users can still select OpenAI/Anthropic models
 *    - OpenAI models require OPENAI_API_KEY to be set
 *    - Anthropic models require ANTHROPIC_API_KEY to be set
 *    - Ollama models require OLLAMA_BASE_URL to be set
 *
 * 2. EMBEDDINGS: ALWAYS use Ollama if OLLAMA_BASE_URL is set, otherwise OpenAI.
 *    - This ensures consistency with the data pipeline embeddings
 *
 * 3. TITLE MODEL: ALWAYS use Ollama if OLLAMA_BASE_URL is set, otherwise OpenAI.
 *    - Title generation always follows the Ollama preference when available
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
 * Ollama:
 * - "ollama-{model-name}" → Configured model (default: llama3.1:8b, set via OLLAMA_CHAT_MODEL env var)
 *
 * Utility:
 * - "title-model-openai" → gpt-4o-mini (for generating chat titles)
 * - "title-model-anthropic" → claude-3-5-haiku-latest (for generating chat titles)
 * - "title-model-ollama" → Configured model (default: same as chat model, set via OLLAMA_TITLE_MODEL env var)
 */

// Get Ollama model name from environment variable, default to llama3.1:8b
// This allows users to configure which Ollama model to use
const getOllamaChatModel = () => {
  return process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b";
};

const getOllamaTitleModel = () => {
  // Title model can be different from chat model, but defaults to same as chat model
  return process.env.OLLAMA_TITLE_MODEL || getOllamaChatModel();
};

// Build language models object
// Note: ai-sdk-ollama returns LanguageModelV2, but customProvider accepts it
//
// - OpenAI models: Always available (will fail at runtime if OPENAI_API_KEY not set)
// - Anthropic models: Always available (will fail at runtime if ANTHROPIC_API_KEY not set)
// - Ollama models: Always available (will fail at runtime if OLLAMA_BASE_URL not set)
const baseLanguageModels: Record<string, any> = {
  // OpenAI Models - ALWAYS available (requires OPENAI_API_KEY)
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
};

// Add Ollama models using lazy evaluation
// This ensures the provider is created with the correct baseURL from runtime environment
// Model ID is dynamically generated based on the configured model name
const ollamaChatModel = getOllamaChatModel();
const ollamaTitleModel = getOllamaTitleModel();
const ollamaModelId = `ollama-${ollamaChatModel.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
baseLanguageModels[ollamaModelId] = getOllamaProvider()(ollamaChatModel) as any;
baseLanguageModels["title-model-ollama"] = getOllamaProvider()(ollamaTitleModel) as any;

export const myProvider = customProvider({
  languageModels: baseLanguageModels,
});

/**
 * Get the title model ID based on environment variables.
 * 
 * RULES:
 * - ALWAYS use Ollama (configured model) if OLLAMA_BASE_URL is set
 * - Otherwise, use TITLE_PROVIDER env var if set (anthropic/openai)
 * - Defaults to OpenAI if neither OLLAMA_BASE_URL nor TITLE_PROVIDER is set
 * 
 * When using Ollama, uses the model configured via OLLAMA_TITLE_MODEL (defaults to OLLAMA_CHAT_MODEL).
 */
export function getTitleModelId(): string {
  // Priority 1: If Ollama is configured, ALWAYS use it for titles
  if (process.env.OLLAMA_BASE_URL) {
    return "title-model-ollama";
  }
  
  // Priority 2: Use TITLE_PROVIDER if explicitly set
  const provider = process.env.TITLE_PROVIDER?.toLowerCase();
  if (provider === "anthropic") return "title-model-anthropic";
  if (provider === "ollama") return "title-model-ollama";
  
  // Priority 3: Default to OpenAI
  return "title-model-openai";
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
  // Ollama - dynamically mapped based on configured model
  // Utility
  "title-model-openai": "gpt-4o-mini",
  "title-model-anthropic": "claude-3-5-haiku-latest",
  "title-model-ollama": getOllamaTitleModel(),
};

/**
 * Get the actual provider model ID from our custom model ID.
 * Used for cost calculation with tokenlens.
 *
 * @param customModelId - Our custom model ID (e.g., "openai-gpt-4o")
 * @returns The actual provider model ID (e.g., "gpt-4o")
 */
export function getActualModelId(customModelId: string): string {
  // Handle dynamic Ollama model IDs
  if (customModelId.startsWith("ollama-")) {
    return getOllamaChatModel();
  }
  return MODEL_ID_MAP[customModelId] || customModelId;
}

/**
 * Get the Ollama chat model ID for use in the UI
 * @returns The model ID (e.g., "ollama-llama3-1-8b")
 */
export function getOllamaModelId(): string {
  const ollamaChatModel = getOllamaChatModel();
  return `ollama-${ollamaChatModel.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
}
