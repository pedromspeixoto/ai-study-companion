import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { AnimatePresence } from "framer-motion";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/chat/schema";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "@/components/data-stream-provider";
import { Conversation, ConversationContent } from "@/components/elements/conversation";
import { Greeting } from "@/components/greeting";
import { PreviewMessage, ThinkingMessage } from "@/components/message";

type MessagesProps = {
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  selectedModelId: string;
};

function PureMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  // Initialize hasMore based on initial message count (if we got 50, there might be more)
  const [hasMore, setHasMore] = useState(messages.length >= 50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>(messages);

  useDataStream();

  // Update all messages when messages prop changes
  useEffect(() => {
    setAllMessages((prev) => {
      // If prev is empty, just use messages from props
      if (prev.length === 0) {
        return messages;
      }

      // Create a map of previous messages by ID
      const prevMap = new Map(prev.map((m) => [m.id, m]));

      // Find messages from props that are new or updated
      const newOrUpdatedMessages = messages.filter((msg) => {
        const prevMsg = prevMap.get(msg.id);
        return !prevMsg || JSON.stringify(prevMsg) !== JSON.stringify(msg);
      });

      // If no new messages, keep prev as-is
      if (newOrUpdatedMessages.length === 0) {
        return prev;
      }

      // Update existing messages and add new ones at the end
      const updatedMap = new Map(prev.map((m) => [m.id, m]));
      const newMessages: ChatMessage[] = [];

      for (const msg of newOrUpdatedMessages) {
        if (updatedMap.has(msg.id)) {
          updatedMap.set(msg.id, msg);
        } else {
          newMessages.push(msg);
        }
      }

      // Combine: existing messages (in order) + new messages
      return [...Array.from(updatedMap.values()), ...newMessages];
    });
  }, [messages]);

  // Wrapper for setMessages that also updates allMessages
  const handleSetMessages = (
    updater: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[])
  ) => {
    if (typeof updater === "function") {
      setMessages((prev) => {
        const updated = updater(prev);
        // Also update allMessages to reflect changes
        setAllMessages((all) => {
          const updatedMap = new Map(updated.map((m) => [m.id, m]));
          return all.map((msg) => updatedMap.get(msg.id) || msg);
        });
        return updated;
      });
    } else {
      setMessages(updater);
      // Also update allMessages
      setAllMessages((all) => {
        const updatedMap = new Map(updater.map((m) => [m.id, m]));
        return all.map((msg) => updatedMap.get(msg.id) || msg);
      });
    }
  };

  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const oldestMessageId = allMessages[0]?.id;
      const response = await fetch(
        `/api/messages?chatId=${chatId}&before=${oldestMessageId}&limit=50`
      );
      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        // Store current scroll position to maintain it after loading
        const container = messagesContainerRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;

        setAllMessages((prev) => [...data.messages, ...prev]);
        setHasMore(data.hasMore);

        // Restore scroll position after new messages are rendered
        requestAnimationFrame(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            const scrollDiff = scrollHeightAfter - scrollHeightBefore;
            container.scrollTop = scrollDiff;
          }
        });
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to load more messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Auto-scroll to bottom when message is submitted or streaming starts
  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      // Use scrollToBottom from hook for consistent behavior
      scrollToBottom("smooth");
    }
  }, [status, scrollToBottom]);

  // Also scroll when messages array changes (new message added)
  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      // Double requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom("smooth");
        });
      });
    }
  }, [allMessages.length, status, scrollToBottom]);

  return (
    <div
      className="overscroll-behavior-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-scroll"
      ref={messagesContainerRef}
      style={{ overflowAnchor: "none" }}
    >
      {hasMore && (
        <div className="sticky top-0 z-10 flex justify-center pt-4">
          <button
            aria-label="Load more messages"
            className="rounded-full border bg-background px-4 py-2 shadow-lg transition-colors hover:bg-muted disabled:opacity-50"
            onClick={loadMoreMessages}
            disabled={isLoadingMore}
            type="button"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Loading...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ArrowUpIcon className="size-4" />
                Load earlier messages
              </span>
            )}
          </button>
        </div>
      )}

      <Conversation className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 md:gap-6">
        <ConversationContent className="flex flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {allMessages.length === 0 && <Greeting />}

          {allMessages.map((message, index) => (
            <PreviewMessage
              chatId={chatId}
              isLoading={
                status === "streaming" && allMessages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && index === allMessages.length - 1
              }
              setMessages={handleSetMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          <AnimatePresence mode="wait">
            {status === "submitted" && <ThinkingMessage key="thinking" />}
          </AnimatePresence>

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </ConversationContent>
      </Conversation>

      {!isAtBottom && (
        <button
          aria-label="Scroll to bottom"
          className="-translate-x-1/2 absolute bottom-40 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
          onClick={() => scrollToBottom("smooth")}
          type="button"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (prevProps.selectedModelId !== nextProps.selectedModelId) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (!equal(prevProps.messages, nextProps.messages)) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }

  return false;
});
