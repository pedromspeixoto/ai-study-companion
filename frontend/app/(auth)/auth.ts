import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { getUser, getUserById } from "@/lib/db/users/queries";
import { authConfig } from "./auth.config";

export type UserType = "regular";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession["user"];
  }

  // biome-ignore lint/nursery/useConsistentTypeDefinitions: "Required"
  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  trustHost: true, // Trust host in all environments (Auth.js v5 requirement)
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);

        if (users.length === 0) {
          throw new Error("Invalid credentials");
        }

        const [user] = users;

        if (!user.password) {
          throw new Error("Invalid credentials");
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          throw new Error("Invalid credentials");
        }

        return { id: user.id, email: user.email, type: "regular" };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
      }

      return token;
    },
    async session({ session, token }) {
      // Verify the user still exists in the database BEFORE setting session data
      // If they don't exist, invalidate the session (effectively logs them out)
      if (token.id) {
        try {
          const dbUser = await getUserById(token.id);
          if (!dbUser) {
            console.warn("[auth] User not found in database, invalidating session:", {
              userId: token.id,
              email: session.user?.email,
            });
            // Throw error to invalidate the session
            // NextAuth will treat this as no session, effectively logging the user out
            throw new Error("User no longer exists in database");
          }
        } catch (error) {
          // If it's our intentional error, re-throw it
          if (error instanceof Error && error.message === "User no longer exists in database") {
            throw error;
          }
          console.error("[auth] Error checking user existence:", {
            userId: token.id,
            error: error instanceof Error ? error.message : String(error),
          });
          // On error, invalidate the session for security
          throw new Error("Failed to verify user existence");
        }
      }

      // User exists, proceed with normal session setup
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }

      return session;
    },
  },
});
