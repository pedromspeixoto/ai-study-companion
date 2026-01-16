import type { UserType } from "@/app/(auth)/auth";
import type { ChatModel } from "@/lib/ai/models";

type Entitlements = {
  maxMessagesPerDay: number;
  availableChatModelIds: ChatModel["id"][];
};

export const entitlementsByUserType: Record<UserType, Entitlements> = {/*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 100,
    availableChatModelIds: ["chat-model", "chat-model-reasoning", "rag-model"],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
