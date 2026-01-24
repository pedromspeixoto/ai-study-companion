import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getChatById } from "@/lib/db/chat/queries";
import { getMessagesByChatId } from "@/lib/db/chat/queries";
import { convertToUIMessages } from "@/lib/utils/messages";

async function ChatPageContent({ id }: { id: string }) {
  const chat = await getChatById({ id });

  if (!chat) {
    notFound();
  }

  const session = await auth();

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/chat/${id}`)}`);
  }

  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
    limit: 50, // Load only the last 50 messages initially
  });

  const uiMessages = convertToUIMessages(messagesFromDb);

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");

  if (!chatModelFromCookie) {
    return (
      <Chat
        autoResume={true}
        id={chat.id}
        initialChatModel={DEFAULT_CHAT_MODEL}
        initialLastContext={chat.lastContext ?? undefined}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
    );
  }

  return (
    <Chat
      autoResume={true}
      id={chat.id}
      initialChatModel={chatModelFromCookie.value}
      initialLastContext={chat.lastContext ?? undefined}
      initialMessages={uiMessages}
      initialVisibilityType={chat.visibility}
      isReadonly={session?.user?.id !== chat.userId}
    />
  );
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <ChatPageContent id={id} />
    </Suspense>
  );
}
