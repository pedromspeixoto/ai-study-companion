import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils/messages";
import { user, type User } from "@/lib/db/users/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import { message, chat } from "@/lib/db/chat/schema";

// TODO: Use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * Get a user by email
 * @param email - The email of the user
 * @returns The user
 */
export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error("[getUser] Database error getting user by email:", {
      email,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to get user by email: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get a user by id
 * @param id - The id of the user
 * @returns The user or null if not found
 */
export async function getUserById(id: string): Promise<User | null> {
  try {
    const [foundUser] = await db.select().from(user).where(eq(user.id, id));
    return foundUser ?? null;
  } catch (error) {
    console.error("[getUserById] Failed to get user by id:", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by id"
    );
  }
}

/**
 * Create a user
 * @param email - The email of the user
 * @param password - The password of the user
 * @returns The user
 */
export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

/**
 * Get the message count by user id
 * @param id - The id of the user
 * @param differenceInHours - The difference in hours
 * @returns The message count
 */
export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}
