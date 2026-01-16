# RAG Chat Starter

## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports xAI (default), OpenAI, Fireworks, and other model providers
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility
- Data Persistence
  - PostgreSQL + pgvector (Docker Compose recipe included) for chat history, documents, and embeddings
  - Local disk storage for file uploads with an easily extensible abstraction for S3, GCS, etc.
- Artifact surfaces
  - Long-form text editor with suggestions
  - CSV/sheet previewer
- [Auth.js](https://authjs.dev)
  - Simple and secure authentication

## Getting Started

1. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

   Update `AUTH_SECRET` and set `OPENAI_API_KEY` (or point the provider config at your preferred model).

2. Start the local infrastructure:

   ```bash
   docker compose up -d
   ```

   This brings up Postgres with pgvector plus a Redis instance for resumable streams (enable it by keeping `REDIS_URL` in `.env.local`).

3. Install dependencies and run database migrations:

   ```bash
   pnpm install
   pnpm db:migrate
   ```

4. Launch the dev server:

   ```bash
   pnpm dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to start chatting. The default storage directory for uploaded files is `public/uploads`.

## Adapting To Your Stack

- **Model providers** – The adapter in `lib/ai/agents/providers.ts` defaults to OpenAI via `@ai-sdk/openai`, but you can swap in any `ai-sdk` provider or custom implementation.
- **Retrieval** – Plug your vector store and chunking pipeline into the chat route or create dedicated API routes. The Postgres + pgvector container is ready for embeddings.
- **Storage** – Extend `lib/storage` to target S3, GCS, or any other object store without touching the upload API.

### Adding a New Model (example: image generation)

1. **Pick the provider** – decide which backend model you want (e.g., `openai("gpt-image-1")`).
2. **Wrap it in `lib/ai/agents/providers.ts`** – create a wrapped instance (optionally with middleware for defaults) and register it under a logical ID such as `"image-model"` inside the `customProvider` map.
3. **Expose it to the app** – add the ID to `lib/ai/entitlements.ts`, `lib/ai/agents/models.ts`, and adjust any Zod schemas or UI code that enumerate model IDs so users can select it.
4. **Adapt the UX** – update components (e.g., input form, artifact logic) to handle the new model’s capabilities.
5. **Document env requirements** – if the provider needs extra credentials, surface them in `.env.example`.

## Scripts

- `pnpm db:migrate` – run pending drizzle migrations
- `pnpm db:generate` – generate SQL migrations from schema changes
- `pnpm dev` – start the Next.js development server
- `pnpm build` – run migrations and produce a production build
