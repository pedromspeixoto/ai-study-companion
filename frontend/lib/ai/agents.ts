import "server-only";

import {
  stepCountIs,
  ToolLoopAgent,
  type LanguageModelUsage,
} from "ai";
import type { Session } from "next-auth";
import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "@/lib/types";
import { isProductionEnvironment } from "@/lib/constants";
import { myProvider } from "@/lib/ai/providers";
import { getInformationFromEmbeddings } from "@/lib/ai/agents/tools/get-information-from-embeddings";
import { getAllResources } from "@/lib/ai/agents/tools/get-all-resources";
import { getWeather } from "@/lib/ai/agents/tools/get-weather";

// ============================================================================
// Types
// ============================================================================

export type RequestHints = {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  country?: string | null;
};

type CreateAgentOptions = {
  requestHints?: RequestHints;
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  onFinish?: (usage: LanguageModelUsage) => Promise<void> | void;
};

function getRequestPromptFromHints(requestHints: RequestHints): string {
  const { latitude, longitude, city, country } = requestHints;

  if (
    latitude == null &&
    longitude == null &&
    (!city || city.length === 0) &&
    (!country || country.length === 0)
  ) {
    return "";
  }

  const details = [
    latitude != null ? `- lat: ${latitude}` : null,
    longitude != null ? `- lon: ${longitude}` : null,
    city ? `- city: ${city}` : null,
    country ? `- country: ${country}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `About the origin of user's request:\n${details}`;
}

// ============================================================================
// Agent Creation Functions
// ============================================================================

/**
 * Creates a RAG agent that only answers questions using information from uploaded documents.
 */
export function createRagAgent({
  requestHints,
  session,
  dataStream,
  onFinish,
}: CreateAgentOptions) {
  const instructions = [
    `You are a document-based assistant that ONLY answers questions using information from uploaded documents.

STRICT RULES:
1. When users ask about what documents are available, what information you have access to, or what files have been uploaded, use the getAllResources tool to list all available documents.
2. For all other questions, you MUST use the getInformationFromEmbeddings tool to search for information before answering ANY question.
3. You can ONLY provide information that is found in the retrieved embeddings from uploaded documents.
4. NEVER provide general explanations, general knowledge, or information not found in the documents.
5. NEVER say "I can help with general explanations" or offer to provide information outside the documents.
6. If the information is NOT found in the documents, you MUST respond with ONLY: "I don't have information about this topic in the uploaded documents."
7. Do NOT offer alternatives, general knowledge, or explanations outside the documents.
8. Do NOT apologize or provide lengthy explanations when information is not found - simply state it's not available.

When answering:
- For questions about available documents: Use getAllResources tool and list the documents with their filenames and status.
- For content questions: 
  1. ALWAYS call getInformationFromEmbeddings tool first
  2. If the tool returns results (non-empty array), you MUST use that content to answer the question
  3. Synthesize information from all returned results to provide a comprehensive answer
  4. Cite the source documents when referencing specific information
  5. Only if the tool returns an empty array should you respond with: "I don't have information about this topic in the uploaded documents."
- Base your response ONLY on the content retrieved from the getInformationFromEmbeddings tool.
- If the tool returns results, you MUST use them - do not say information is unavailable when results are returned.`,
    requestHints ? getRequestPromptFromHints(requestHints) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return new ToolLoopAgent({
    model: myProvider.languageModel("rag-model"),
    instructions,
    tools: {
      getInformationFromEmbeddings,
      getAllResources,
    },
    stopWhen: stepCountIs(5),
    experimental_telemetry: {
      isEnabled: isProductionEnvironment,
      functionId: "stream-text",
    },
    onFinish: onFinish
      ? async ({ usage }: { usage: LanguageModelUsage }) => {
          await onFinish(usage);
        }
      : undefined,
  });
}

/**
 * Creates a general-purpose chat agent with all tools enabled.
 */
export function createChatAgent({
  requestHints,
  session,
  dataStream,
  onFinish,
}: CreateAgentOptions) {
  const instructions = [
    "You are a friendly assistant! Keep your responses concise and helpful.",
    requestHints ? getRequestPromptFromHints(requestHints) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return new ToolLoopAgent({
    model: myProvider.languageModel("chat-model"),
    instructions,
    tools: {
      getWeather,
    },
    stopWhen: stepCountIs(5),
    experimental_telemetry: {
      isEnabled: isProductionEnvironment,
      functionId: "stream-text",
    },
    onFinish: onFinish
      ? async ({ usage }: { usage: LanguageModelUsage }) => {
          await onFinish(usage);
        }
      : undefined,
  });
}

/**
 * Creates a reasoning agent with enhanced reasoning capabilities and no tools.
 */
export function createReasoningAgent({
  requestHints,
  session,
  dataStream,
  onFinish,
}: CreateAgentOptions) {
  const instructions = [
    "You are a friendly assistant! Keep your responses concise and helpful.",
    requestHints ? getRequestPromptFromHints(requestHints) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return new ToolLoopAgent({
    model: myProvider.languageModel("chat-model-reasoning"),
    instructions,
    tools: {},
    stopWhen: stepCountIs(5),
    experimental_telemetry: {
      isEnabled: isProductionEnvironment,
      functionId: "stream-text",
    },
    onFinish: onFinish
      ? async ({ usage }: { usage: LanguageModelUsage }) => {
          await onFinish(usage);
        }
      : undefined,
  });
}

// ============================================================================
// Agent Factory (for backward compatibility / convenience)
// ============================================================================

/**
 * Creates an agent based on the model ID. This is a convenience function
 * that routes to the specific agent creation function.
 */
export function createAgent(
  modelId: "rag-model" | "chat-model" | "chat-model-reasoning",
  options: CreateAgentOptions
) {
  switch (modelId) {
    case "rag-model":
      return createRagAgent(options);
    case "chat-model":
      return createChatAgent(options);
    case "chat-model-reasoning":
      return createReasoningAgent(options);
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = modelId;
      throw new Error(`Unknown model ID: ${modelId}`);
  }
}
