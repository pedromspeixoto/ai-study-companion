import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatById, getMessagesByChatId } from "@/lib/db/chat/queries";
import { convertToUIMessages } from "@/lib/utils/messages";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  const before = searchParams.get("before");
  const limit = Number.parseInt(searchParams.get("limit") || "50", 10);

  if (!chatId) {
    return NextResponse.json(
      { error: "Chat ID is required" },
      { status: 400 }
    );
  }

  try {
    // Verify user has access to the chat
    const chat = await getChatById({ id: chatId });

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Check if user has access to this chat
    if (chat.visibility === "private" && chat.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get messages with pagination
    const messages = await getMessagesByChatId({
      id: chatId,
      limit,
      before: before || undefined,
    });

    const uiMessages = convertToUIMessages(messages);

    return NextResponse.json({
      messages: uiMessages,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
