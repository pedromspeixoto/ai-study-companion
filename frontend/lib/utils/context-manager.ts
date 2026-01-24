import type { ChatMessage } from "@/lib/types";

/**
 * Rough token estimation (4 chars ≈ 1 token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens in a message
 */
export function countMessageTokens(message: ChatMessage): number {
  let tokens = 0;

  for (const part of message.parts) {
    if (part.type === "text" && part.text) {
      tokens += estimateTokens(part.text);
    }
    // Add overhead for message structure
    tokens += 10;
  }

  return tokens;
}

/**
 * Count total tokens in an array of messages
 */
export function countTotalTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => total + countMessageTokens(msg), 0);
}

/**
 * Condense old messages by summarizing them
 * Keeps the most recent messages intact and creates a summary of older ones
 */
export function condenseMessages(
  messages: ChatMessage[],
  maxTokens: number = 100000, // Conservative limit for Claude
  keepRecentCount: number = 10 // Keep last 10 messages
): {
  condensed: ChatMessage[];
  wasCondensed: boolean;
  originalCount: number;
  condensedCount: number;
  tokensSaved: number;
} {
  const totalTokens = countTotalTokens(messages);

  // If we're under the limit, no need to condense
  if (totalTokens < maxTokens * 0.7) { // Use 70% threshold (more aggressive)
    return {
      condensed: messages,
      wasCondensed: false,
      originalCount: messages.length,
      condensedCount: messages.length,
      tokensSaved: 0,
    };
  }

  // Keep recent messages
  const recentMessages = messages.slice(-keepRecentCount);
  const oldMessages = messages.slice(0, -keepRecentCount);

  // Create a summary of old messages
  const summaryText = createMessagesSummary(oldMessages);

  const summaryMessage: ChatMessage = {
    id: `summary-${Date.now()}`,
    role: "assistant",
    parts: [{
      type: "text",
      text: `[Previous context: ${oldMessages.length} messages summarized. ${summaryText}]`,
    }],
  };

  const condensed = [summaryMessage, ...recentMessages];

  const tokensSaved = countTotalTokens(oldMessages) - countTotalTokens([summaryMessage]);

  return {
    condensed,
    wasCondensed: true,
    originalCount: messages.length,
    condensedCount: condensed.length,
    tokensSaved,
  };
}

/**
 * Create a brief summary of messages
 */
function createMessagesSummary(messages: ChatMessage[]): string {
  const topics: string[] = [];
  let userQuestions = 0;
  let assistantResponses = 0;

  for (const msg of messages) {
    if (msg.role === "user") {
      userQuestions++;
      // Extract first few words as topics
      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          const words = part.text.trim().split(/\s+/).slice(0, 5).join(" ");
          if (words) topics.push(words);
        }
      }
    } else {
      assistantResponses++;
    }
  }

  const uniqueTopics = [...new Set(topics)].slice(0, 3);
  const topicsText = uniqueTopics.length > 0
    ? `Topics discussed: ${uniqueTopics.join("; ")}.`
    : "";

  return `${userQuestions} questions and ${assistantResponses} responses. ${topicsText}`;
}

/**
 * Check if messages are approaching context limit
 */
export function isApproachingLimit(
  messages: ChatMessage[],
  warningThreshold: number = 80000
): boolean {
  return countTotalTokens(messages) > warningThreshold;
}
