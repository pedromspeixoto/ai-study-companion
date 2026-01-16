import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "@tokenlens/helpers/context";
import { auth, type UserType } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { type ChatModel } from "@/lib/ai/models";
import {
  type RequestHints,
  createAgent,
} from "@/lib/ai/agents";
import { myProvider } from "@/lib/ai/providers";
import {
  getMessageCountByUserId,
  getUserById,
} from "@/lib/db/users/queries";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatLastContextById,
} from "@/lib/db/chat/queries";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID } from "@/lib/utils/messages";
import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import { type PostRequestBody, postRequestBodySchema } from "@/app/(chat)/api/chat/schema";

export const maxDuration = 60;

/**
 * The global stream context
 */
let globalStreamContext: ResumableStreamContext | null = null;

/**
 * Flag to prevent concurrent initialization attempts
 * In JavaScript's single-threaded event loop, this prevents
 * multiple simultaneous initialization calls
 */
let isInitializing = false;

/**
 * Get the tokenlens catalog
 * @returns The tokenlens catalog
 */
const getTokenlensCatalog = cache(
  async (): Promise<Awaited<ReturnType<typeof fetchModels>> | undefined> => {
    try {
      return await fetchModels();
    } catch (err) {
      console.warn(
        "TokenLens: catalog fetch failed, using default catalog",
        err
      );
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 } // 24 hours
);

/**
 * Get the stream context
 * Thread-safe lazy initialization: ensures only one context is created
 * even under concurrent requests (though JS single-threaded model makes
 * this primarily relevant for edge cases and clarity)
 * @returns The stream context
 */
export function getStreamContext(): ResumableStreamContext | null {
  // Fast path: context already exists
  if (globalStreamContext) {
    return globalStreamContext;
  }

  // Prevent concurrent initialization
  if (isInitializing) {
    // If another request is initializing, return null
    // The context will be available on subsequent calls
    return null;
  }

  // Mark as initializing before attempting creation
  isInitializing = true;

  try {
    globalStreamContext = createResumableStreamContext({
      waitUntil: after,
    });
    return globalStreamContext;
  } catch (error: any) {
    if (error.message.includes("REDIS_URL")) {
      console.log(
        " > Resumable streams are disabled due to missing REDIS_URL"
      );
    } else {
      console.error(error);
    }
    return null;
  } finally {
    // Always clear the flag, even if initialization failed
    isInitializing = false;
  }
}

/**
 * The POST request handler
 * @param request - The request
 * @returns The response
 */
export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  console.log("[POST /api/chat] Received request");

  // Parse the request body
  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
    console.log("[POST /api/chat] Request body parsed:", {
      chatId: requestBody.id,
      selectedChatModel: requestBody.selectedChatModel,
      selectedVisibilityType: requestBody.selectedVisibilityType,
      messageId: requestBody.message?.id,
    });
  } catch (error) {
    console.error("[POST /api/chat] Failed to parse request body:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new ChatSDKError("bad_request:api").toResponse();
  }

  // Validate the request body
  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    // Get the session
    const session = await auth();

    // Check if the session is valid
    if (!session?.user) {
      console.warn("[POST /api/chat] Unauthorized: No session or user");
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    console.log("[POST /api/chat] Authenticated user:", {
      userId: session.user.id,
      userType: session.user.type,
    });

    // Verify the user exists in the database
    const dbUser = await getUserById(session.user.id);
    if (!dbUser) {
      console.error("[POST /api/chat] User not found in database:", {
        userId: session.user.id,
        email: session.user.email,
      });
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    // Get the message count
    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    // Check if the user has exceeded the message limit
    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const chat = await getChatById({ id });

    if (chat) {
      console.log("[POST /api/chat] Chat already exists:", { id, userId: chat.userId });
      if (chat.userId !== session.user.id) {
        console.warn("[POST /api/chat] Forbidden: Chat belongs to different user:", {
          chatUserId: chat.userId,
          sessionUserId: session.user.id,
        });
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    } else {
      console.log("[POST /api/chat] Creating new chat:", {
        id,
        userId: session.user.id,
        visibility: selectedVisibilityType,
      });
      
      const title = await generateTitleFromUserMessage({
        message,
      });

      console.log("[POST /api/chat] Generated title:", title);

      try {
        await saveChat({
          id,
          userId: session.user.id,
          title,
          visibility: selectedVisibilityType,
        });
        console.log("[POST /api/chat] Successfully created chat:", id);
      } catch (error) {
        console.error("[POST /api/chat] Error creating chat:", {
          id,
          userId: session.user.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }

    // Get the messages from the database
    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const requestHints: RequestHints | undefined = undefined;

    // Save the messages to the database
    // Extend requestHints with geolocation or tenant-specific context if available.
    console.log("[POST /api/chat] Saving user message:", {
      chatId: id,
      messageId: message.id,
      role: "user",
    });
    try {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
      console.log("[POST /api/chat] Successfully saved user message");
    } catch (error) {
      console.error("[POST /api/chat] Error saving user message:", {
        chatId: id,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Generate a stream ID
    const streamId = generateUUID();

    // Create a stream ID
    await createStreamId({ streamId, chatId: id });

    let finalMergedUsage: AppUsage | undefined;

    // Create a stream
    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const agent = createAgent(
          selectedChatModel as "rag-model" | "chat-model" | "chat-model-reasoning",
          {
          requestHints,
          session,
          dataStream,
          onFinish: async (usage) => {
            try {
              const providers = await getTokenlensCatalog();
              const modelId =
                myProvider.languageModel(selectedChatModel).modelId;
              if (!modelId) {
                finalMergedUsage = usage;
                dataStream.write({
                  type: "data-usage",
                  data: finalMergedUsage,
                });
                return;
              }

              if (!providers) {
                finalMergedUsage = usage;
                dataStream.write({
                  type: "data-usage",
                  data: finalMergedUsage,
                });
                return;
              }

              const summary = getUsage({ modelId, usage, providers });
              finalMergedUsage = { ...usage, ...summary, modelId } as AppUsage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            } catch (err) {
              console.warn("TokenLens enrichment failed", err);
              finalMergedUsage = usage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            }
          },
        });

        const result = await agent.stream({
          messages: await convertToModelMessages(uiMessages),
          experimental_transform: smoothStream({ chunking: "word" }),
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          })
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });

        if (finalMergedUsage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: finalMergedUsage,
            });
          } catch (err) {
            console.warn("Unable to persist last usage for chat", id, err);
          }
        }
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    // Get the stream context
    const streamContext = getStreamContext();

    // Check if the stream context is valid
    if (streamContext) {
      // Return the stream
      return new Response(
         await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream())
        )
      );
    }

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Unhandled error in chat API:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

/**
 * The DELETE request handler
 * @param request - The request
 * @returns The response
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
