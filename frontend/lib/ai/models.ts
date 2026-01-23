// ============================================================================
// Model Definitions (Client-Safe)
// ============================================================================

export const DEFAULT_CHAT_MODEL = "openai-gpt-4o";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
  provider: "openai" | "anthropic";
};

export const chatModels: ChatModel[] = [
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

