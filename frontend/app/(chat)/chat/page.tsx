import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils/messages";
import { auth } from "@/app/(auth)/auth";

async function ChatPageContent() {
  const session = await auth();

  if (!session) {
    redirect("/login?callbackUrl=/chat");
  }

  const id = generateUUID();
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");

  if (!modelIdFromCookie) {
    return (
      <Chat
        autoResume={false}
        id={id}
        initialChatModel={DEFAULT_CHAT_MODEL}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
      />
    );
  }

  return (
    <Chat
      autoResume={false}
      id={id}
      initialChatModel={modelIdFromCookie.value}
      initialMessages={[]}
      initialVisibilityType="private"
      isReadonly={false}
      key={id}
    />
  );
}

export default async function Page() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
