FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (skip migrations - they run at startup)
RUN pnpm exec next build

# Expose Next.js port
EXPOSE 3000

# Run migrations then start the application
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
