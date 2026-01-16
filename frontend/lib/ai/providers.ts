import { openai } from "@ai-sdk/openai";
import {
  customProvider,
  defaultSettingsMiddleware,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";

/**
 * Create a model with settings middleware
 */
function createModelWithSettings(settings: {
  modelId: string;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  return wrapLanguageModel({
    model: openai.responses(settings.modelId),
    middleware: defaultSettingsMiddleware({
      settings: {
        maxOutputTokens: settings.maxOutputTokens,
        providerOptions: {
          openai: {
            reasoningEffort: settings.reasoningEffort,
          },
        },
      },
    }),
  });
}

/**
 * Custom provider that maps model IDs to their implementations.
 *
 * Model ID mappings:
 * - "chat-model" → GPT-4 (gpt-4)
 * - "chat-model-reasoning" → GPT-4o (gpt-4o) with reasoning
 * - "rag-model" → GPT-4o (gpt-4o) with RAG
 * - "title-model" → GPT-4o Mini (gpt-4o-mini) for titles
 */
export const myProvider = customProvider({
  languageModels: {
    "chat-model": openai.responses("gpt-4"),
    "chat-model-reasoning": wrapLanguageModel({
      model: wrapLanguageModel({
        model: openai.responses("gpt-4o"),
        middleware: defaultSettingsMiddleware({
          settings: {
            providerOptions: {
              openai: {
                reasoningEffort: "high",
              },
            },
          },
        }),
      }),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    "rag-model": createModelWithSettings({
      modelId: "gpt-4o",
      maxOutputTokens: 2048,
      reasoningEffort: "medium",
    }),
    "title-model": createModelWithSettings({
      modelId: "gpt-4o-mini",
      maxOutputTokens: 256,
      reasoningEffort: "medium",
    }),
  },
});
