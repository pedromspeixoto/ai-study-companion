// ============================================================================
// Model Definitions (Client-Safe)
// ============================================================================

import { getOllamaModelId } from "@/lib/ai/providers";

/**
 * Default chat model selection.
 * 
 * - If OLLAMA_BASE_URL is set: defaults to configured Ollama model (e.g., "ollama-llama3-1-8b")
 * - Otherwise: defaults to "openai-gpt-4o"
 * 
 * Note: This is evaluated at runtime, not build time, to support dynamic Ollama model configuration.
 */
export function getDefaultChatModel(): string {
  if (process.env.OLLAMA_BASE_URL) {
    const ollamaChatModel = process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b";
    return `ollama-${ollamaChatModel.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  }
  return "openai-gpt-4o";
}

// For backward compatibility, export as constant (will be evaluated at runtime)
export const DEFAULT_CHAT_MODEL = getDefaultChatModel();

export type ChatModel = {
  id: string;
  name: string;
  description: string;
  provider: "openai" | "anthropic" | "ollama";
};

export function getChatModels(): ChatModel[] {
  const baseModels: ChatModel[] = [
    // OpenAI Models
    {
      id: "openai-gpt-4o",
      name: "GPT-4o",
      description: "OpenAI's most capable model. Fast and intelligent with vision capabilities.",
      provider: "openai",
    },
    {
      id: "openai-gpt-4o-mini",
      name: "GPT-4o Mini",
      description: "OpenAI's efficient model. Great balance of speed and capability.",
      provider: "openai",
    },
    {
      id: "openai-gpt-4-turbo",
      name: "GPT-4 Turbo",
      description: "OpenAI's GPT-4 Turbo with 128K context window.",
      provider: "openai",
    },
    // Anthropic Models
    {
      id: "anthropic-claude-sonnet",
      name: "Claude 3.5 Sonnet",
      description: "Anthropic's balanced model. Excellent reasoning and writing.",
      provider: "anthropic",
    },
    {
      id: "anthropic-claude-haiku",
      name: "Claude 3.5 Haiku",
      description: "Anthropic's fast and efficient model. Great for quick tasks.",
      provider: "anthropic",
    },
    {
      id: "anthropic-claude-opus",
      name: "Claude 3 Opus",
      description: "Anthropic's most powerful model. Best for complex analysis.",
      provider: "anthropic",
    },
  ];

  const ollamaChatModel = process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b";
  baseModels.push({
    id: getOllamaModelId(),
    name: `${ollamaChatModel} (Ollama)`,
    description: `Ollama model: ${ollamaChatModel}. Runs locally. Requires OLLAMA_BASE_URL to be set.`,
    provider: "ollama",
  });

  return baseModels;
}

export const chatModels: ChatModel[] = getChatModels();

