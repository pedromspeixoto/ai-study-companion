import type { UserType } from "@/app/(auth)/auth";
import type { ChatModel } from "@/lib/ai/models";

type Entitlements = {
  maxMessagesPerDay: number;
  availableChatModelIds: ChatModel["id"][];
};

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 100,
    availableChatModelIds: [
      // OpenAI models
      "openai-gpt-4o",
      "openai-gpt-4o-mini",
      "openai-gpt-4-turbo",
      // Anthropic models
      "anthropic-claude-sonnet",
      "anthropic-claude-haiku",
      "anthropic-claude-opus",
    ],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
