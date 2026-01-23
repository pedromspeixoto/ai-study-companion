import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ChatSDKError } from "@/lib/errors";
import {
  type Chat,
  chat,
  type DBMessage,
  message,
  stream,
  vote,
} from "@/lib/db/chat/schema";
import type { VisibilityType } from "@/components/visibility-selector";
import { AppUsage } from "@/lib/usage";

// TODO: Use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * Save a chat
 * @param id - The id of the chat
 * @param userId - The id of the user
 * @param title - The title of the chat
 * @param visibility - The visibility of the chat
 * @returns The chat
 */
export async function saveChat({
    id,
    userId,
    title,
    visibility,
  }: {
    id: string;
    userId: string;
    title: string;
    visibility: VisibilityType;
  }) {
    try {
      console.log("[saveChat] Attempting to save chat:", {
        id,
        userId,
        title,
        visibility,
      });
      const result = await db.insert(chat).values({
        id,
        createdAt: new Date(),
        userId,
        title,
        visibility,
      });
      console.log("[saveChat] Successfully saved chat:", id);
      return result;
    } catch (error) {
      const dbError = error instanceof Error ? error : new Error(String(error));
      console.error("[saveChat] Failed to save chat:", {
        id,
        userId,
        title,
        visibility,
        error: dbError.message,
        errorCode: (error as any)?.code,
        errorDetail: (error as any)?.detail,
        errorConstraint: (error as any)?.constraint,
        errorColumn: (error as any)?.column,
        errorTable: (error as any)?.table,
        fullError: dbError,
        stack: dbError.stack,
      });
      throw new ChatSDKError("bad_request:database", "Failed to save chat");
    }
  }
  
  /**
   * Delete a chat by id
   * @param id - The id of the chat
   * @returns The chat
   */
  export async function deleteChatById({ id }: { id: string }) {
    try {
      await db.delete(vote).where(eq(vote.chatId, id));
      await db.delete(message).where(eq(message.chatId, id));
      await db.delete(stream).where(eq(stream.chatId, id));
  
      const [chatsDeleted] = await db
        .delete(chat)
        .where(eq(chat.id, id))
        .returning();
      return chatsDeleted;
    } catch (_error) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to delete chat by id"
      );
    }
  }
  
  /**
   * Delete all chats by user id
   * @param userId - The id of the user
   * @returns The number of deleted chats
   */
  export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
    try {
      const userChats = await db
        .select({ id: chat.id })
        .from(chat)
        .where(eq(chat.userId, userId));
  
      if (userChats.length === 0) {
        return { deletedCount: 0 };
      }
  
      const chatIds = userChats.map((c: any) => c.id);
  
      await db.delete(vote).where(inArray(vote.chatId, chatIds));
      await db.delete(message).where(inArray(message.chatId, chatIds));
      await db.delete(stream).where(inArray(stream.chatId, chatIds));
  
      const deletedChats = await db
        .delete(chat)
        .where(eq(chat.userId, userId))
        .returning();
  
      return { deletedCount: deletedChats.length };
    } catch (_error) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to delete all chats by user id"
      );
    }
  }
  
  /**
   * Get chats by user id
   * @param id - The id of the user
   * @param limit - The limit of the chats
   * @param startingAfter - The starting after the chat
   * @param endingBefore - The ending before the chat
   * @returns The chats
   */
  export async function getChatsByUserId({
    id,
    limit,
    startingAfter,
    endingBefore,
  }: {
    id: string;
    limit: number;
    startingAfter: string | null;
    endingBefore: string | null;
  }) {
    try {
      const extendedLimit = limit + 1;
  
      const query = (whereCondition?: SQL<any>) =>
        db
          .select()
          .from(chat)
          .where(
            whereCondition
              ? and(whereCondition, eq(chat.userId, id))
              : eq(chat.userId, id)
          )
          .orderBy(desc(chat.createdAt))
          .limit(extendedLimit);
  
      let filteredChats: Chat[] = [];
  
      if (startingAfter) {
        const [selectedChat] = await db
          .select()
          .from(chat)
          .where(eq(chat.id, startingAfter))
          .limit(1);
  
        if (!selectedChat) {
          throw new ChatSDKError(
            "not_found:database",
            `Chat with id ${startingAfter} not found`
          );
        }
  
        filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
      } else if (endingBefore) {
        const [selectedChat] = await db
          .select()
          .from(chat)
          .where(eq(chat.id, endingBefore))
          .limit(1);
  
        if (!selectedChat) {
          throw new ChatSDKError(
            "not_found:database",
            `Chat with id ${endingBefore} not found`
          );
        }
  
        filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
      } else {
        filteredChats = await query();
      }
  
      const hasMore = filteredChats.length > limit;
  
      return {
        chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
        hasMore,
      };
    } catch (_error) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to get chats by user id"
      );
    }
  }
  
  /**
   * Get a chat by id
   * @param id - The id of the chat
   * @returns The chat
   */
  export async function getChatById({ id }: { id: string }) {
    try {
      console.log("[getChatById] Fetching chat:", { id });
      const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
      if (!selectedChat) {
        console.log("[getChatById] Chat not found:", { id });
        return null;
      }
  
      console.log("[getChatById] Found chat:", { id, userId: selectedChat.userId });
      return selectedChat;
    } catch (error) {
      console.error("[getChatById] Failed to get chat by id:", {
        id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
    }
  }
  
  /**
   * Save messages
   * @param messages - The messages to save
   * @returns The messages
   */
  export async function saveMessages({ messages }: { messages: DBMessage[] }) {
    try {
      console.log("[saveMessages] Attempting to save messages:", {
        count: messages.length,
        chatIds: [...new Set(messages.map((m) => m.chatId))],
        messageIds: messages.map((m) => m.id),
      });
      const result = await db.insert(message).values(messages);
      console.log("[saveMessages] Successfully saved messages");
      return result;
    } catch (error) {
      console.error("[saveMessages] Failed to save messages:", {
        count: messages.length,
        chatIds: [...new Set(messages.map((m) => m.chatId))],
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new ChatSDKError("bad_request:database", "Failed to save messages");
    }
  }
  
  /**
   * Get messages by chat id
   * @param id - The id of the chat
   * @param limit - Optional limit of messages to retrieve (default: all)
   * @param before - Optional message ID to get messages before (for pagination)
   * @returns The messages
   */
  export async function getMessagesByChatId({
    id,
    limit,
    before,
  }: {
    id: string;
    limit?: number;
    before?: string;
  }) {
    try {
      let query = db
        .select()
        .from(message)
        .where(eq(message.chatId, id))
        .orderBy(desc(message.createdAt));

      if (before) {
        const [beforeMessage] = await db
          .select()
          .from(message)
          .where(eq(message.id, before))
          .limit(1);

        if (beforeMessage) {
          query = db
            .select()
            .from(message)
            .where(
              and(eq(message.chatId, id), lt(message.createdAt, beforeMessage.createdAt))
            )
            .orderBy(desc(message.createdAt));
        }
      }

      if (limit) {
        query = query.limit(limit) as any;
      }

      const messages = await query;

      // Reverse to get chronological order (oldest first)
      return messages.reverse();
    } catch (_error) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to get messages by chat id"
      );
    }
  }
  
  /**
   * Vote a message
   * @param chatId - The id of the chat
   * @param messageId - The id of the message
   * @param type - The type of the vote
   * @returns The vote
   */
  export async function voteMessage({
    chatId,
    messageId,
    type,
  }: {
    chatId: string;
    messageId: string;
    type: "up" | "down";
  }) {
    try {
      const [existingVote] = await db
        .select()
        .from(vote)
        .where(and(eq(vote.messageId, messageId)));
  
      if (existingVote) {
        return await db
          .update(vote)
          .set({ isUpvoted: type === "up" })
          .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
      }
      return await db.insert(vote).values({
        chatId,
        messageId,
        isUpvoted: type === "up",
      });
    } catch (_error) {
      throw new ChatSDKError("bad_request:database", "Failed to vote message");
    }
  }
  
  /**
   * Get votes by chat id
   * @param id - The id of the chat
   * @returns The votes
   */
  export async function getVotesByChatId({ id }: { id: string }) {
    try {
      return await db.select().from(vote).where(eq(vote.chatId, id));
    } catch (_error) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to get votes by chat id"
      );
    }
  }

  /**
 * Update a chat's last context by id
 * @param chatId - The id of the chat
 * @param context - The context to update
 * @returns The chat
 */
export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store merged server-enriched usage object
  context: AppUsage;
}) {
  try {
    return await db
      .update(chat)
      .set({ lastContext: context })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update lastContext for chat", chatId, error);
    return;
  }
}

/**
 * Create a stream id
 * @param streamId - The id of the stream
 * @param chatId - The id of the chat
 * @returns The stream
 */
export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    console.log("[createStreamId] Creating stream ID:", { streamId, chatId });
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
    console.log("[createStreamId] Successfully created stream ID:", streamId);
  } catch (error) {
    console.error("[createStreamId] Failed to create stream ID:", {
      streamId,
      chatId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

/**
 * Get stream ids by chat id
 * @param chatId - The id of the chat
 * @returns The stream ids
 */
export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

/**
 * Get a message by id
 * @param id - The id of the message
 * @returns The message
 */
export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

/**
 * Delete messages by chat id after timestamp
 * @param chatId - The id of the chat
 * @param timestamp - The timestamp after which to delete the messages
 * @returns The messages
 */
export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage: any) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

/**
 * Update a chat's visibility by id
 * @param chatId - The id of the chat
 * @param visibility - The visibility to update
 * @returns The chat
 */
export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}