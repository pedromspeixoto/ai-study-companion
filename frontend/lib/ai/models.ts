// ============================================================================
// Model Definitions (Client-Safe)
// ============================================================================

export const DEFAULT_CHAT_MODEL = "chat-model";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "rag-model",
    name: "OpenAI GPT-4o (RAG)",
    description:
      "Retrieval-Augmented Generation model that uses embeddings to search for information. Uses GPT-4o (gpt-4o). Only answers based on uploaded documents.",
  },
  {
    id: "chat-model",
    name: "OpenAI GPT-4",
    description:
      "General-purpose chat model with balanced quality and cost. Uses GPT-4 (gpt-4).",
  },
  {
    id: "chat-model-reasoning",
    name: "OpenAI GPT-4o",
    description:
      "Uses enhanced reasoning for complex multi-step questions. Uses GPT-4o (gpt-4o) with high reasoning effort.",
  },
];

export type ToolName =
  | "getWeather"
  | "getInformationFromEmbeddings"
  | "getAllResources";
