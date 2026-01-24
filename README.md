# AI Study Companion

<div align="center">
  <img src="assets/small-demo.gif" alt="Study Companion Demo" width="1024"/>
</div>

A RAG (Retrieval-Augmented Generation) application that processes PDF documents and provides an intelligent chat interface. Query your documents using AI models with semantic search capabilities.

**Table of Contents**
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
- [Local Development](#local-development)
- [Troubleshooting](#troubleshooting)

## Features

- **Local-First AI**: Runs with Ollama by default (no API keys required for basic usage)
- **RAG Pipeline**: Automated PDF processing with semantic search using vector embeddings
- **Multiple AI Models**: Support for OpenAI, Anthropic, and local Ollama models
- **Smart Context Management**: Automatic conversation condensation to stay within token limits
- **Docker Ready**: One-command deployment with all services containerized

## Architecture

The application consists of three main components:

### 1. Data Pipeline (Dagster)
Processes PDF documents and creates searchable embeddings:
- Discovers PDFs in `data/features/` folders
- Extracts text from each PDF page
- Splits text into chunks with overlap
- Generates vector embeddings (via Ollama or OpenAI)
- Stores embeddings in PostgreSQL with pgvector

### 2. Chat Interface (Next.js)
Interactive web app for querying your documents:
- User enters a question
- Question is converted to a vector embedding
- Finds similar document chunks using cosine similarity
- Sends relevant context + question to AI model
- Streams the response back to user

### 3. Storage Layer
- **PostgreSQL**: Stores PDF metadata and conversation history
- **pgvector**: Vector similarity search for semantic matching
- **Redis**: Enables resumable AI streams

```
┌─────────────────┐
│   PDF Files     │
│  data/features/ │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│ Dagster Pipeline│────▶│  PostgreSQL  │
│  (Embeddings)   │     │  + pgvector  │
└─────────────────┘     └──────┬───────┘
                               │
                               ▼
┌─────────────────┐     ┌──────────────┐
│  User Question  │────▶│ Vector Search│
└─────────────────┘     └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  AI Models   │
                        │ (Ollama/GPT) │
                        └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                        │   Response   │
                        └──────────────┘
```

### Key Features

- **Context Management**: Automatically condenses old messages when conversations get long (keeps last 10 messages, summarizes older ones)
- **Smart Chunking**: Documents split into 20K character chunks with 500 char overlap for better retrieval
- **Flexible AI Providers**: Switch between Ollama (local), OpenAI, or Anthropic models
- **Resumable Streams**: Redis enables pausing and resuming AI responses

## Quick Start

### Prerequisites

**For Docker Deployment (Recommended):**
- Docker and Docker Compose
- Ollama (optional, for local AI models - recommended)

**For Local Development:**
- Python 3.10+
- Node.js 18+
- PostgreSQL with pgvector
- pnpm and uv

### Default Setup (Ollama - No API Keys Required)

The app uses Ollama by default for all AI operations. This means you can run everything locally without API keys.

**macOS Setup:**
```bash
# Install and start Ollama
./scripts/setup-ollama-macos.sh

# Start the application
docker compose up -d
```

**Access:**
- Frontend: http://localhost:1337
- Dagster UI: http://localhost:3001

That's it! The app will use local Ollama models for embeddings and chat.

## Configuration

### Using Ollama (Default - No API Keys)

Copy the example environment file:
```bash
cp .env.example .env
```

The default `.env` uses Ollama for all AI operations:
```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
TITLE_PROVIDER=ollama
```

### Using OpenAI/Anthropic (Optional)

If you prefer cloud models, edit `.env` and add API keys:
```env
# Comment out or remove OLLAMA_BASE_URL to use cloud models
# OLLAMA_BASE_URL=http://host.docker.internal:11434

# Add your API keys
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here  # Optional, for Claude models
AUTH_SECRET=generate-with-openssl-rand-base64-32
```

### Deployment

**Start all services:**
```bash
docker compose up -d
```

This starts:
- PostgreSQL with pgvector (port 5432)
- Redis for resumable streams (port 6379)
- Dagster pipeline UI (port 3001)
- Next.js frontend (port 1337)
- pgweb database UI (port 8081)

**Check status:**
```bash
docker compose ps
```

**View logs:**
```bash
docker compose logs -f
```

**Stop services:**
```bash
docker compose down
```

**Clean slate (removes data):**
```bash
docker compose down -v
```

## Usage

### 1. Add PDF Documents

Place PDF files in `data/features/<folder_name>/`:
```
data/features/
├── machine-learning/
│   └── deep-learning.pdf
└── math/
    └── calculus.pdf
```

### 2. Process Documents

Open Dagster UI at http://localhost:3001 and materialize the assets. This will:
- Extract text from PDFs
- Generate embeddings
- Store vectors in the database

### 3. Chat with Your Documents

Open http://localhost:1337 and start asking questions about your PDFs.

## Local Development

For development with hot-reload:

### 1. Start Database Services

```bash
docker compose up -d postgres redis pgweb
```

### 2. Configure Environment

**Dagster** (`data/.env`):
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ai_rag
POSTGRES_USER=ai_rag
POSTGRES_PASSWORD=ai_rag
OLLAMA_BASE_URL=http://localhost:11434  # or add OPENAI_API_KEY
```

**Frontend** (`frontend/.env.local`):
```env
POSTGRES_URL=postgresql://ai_rag:ai_rag@localhost:5432/ai_rag
OLLAMA_BASE_URL=http://localhost:11434  # or add OPENAI_API_KEY
REDIS_URL=redis://localhost:6379
AUTH_SECRET=your-random-secret
```

### 3. Install and Run

**Dagster:**
```bash
cd data
uv pip install -e ".[dev]"
dagster dev  # Opens on http://localhost:3000
```

**Frontend:**
```bash
cd frontend
pnpm install
pnpm dev  # Opens on http://localhost:1337
```

## Advanced Configuration

### Dagster Pipeline Settings

Configure when materializing assets in Dagster UI:
- **Chunk size**: 20,000 characters (default)
- **Chunk overlap**: 500 characters (default)
- **Embedding model**: Configurable (Ollama or OpenAI)

### Available AI Models

The chat interface supports multiple models:
- **Ollama models**: llama3.1:8b (default), or any model you have installed
- **OpenAI**: GPT-4o, GPT-4o Mini, o1, o3-mini
- **Anthropic**: Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus

Switch models in the chat interface dropdown.

### Context Management

Conversations automatically condense when approaching token limits:
- Keeps last 10 messages intact
- Summarizes older messages
- Prevents context overflow errors
- Works with all model providers

## Development Tools

### Useful Commands

**Dagster:**
```bash
dagster dev              # Start dev server
```

**Frontend:**
```bash
pnpm dev                 # Start dev server
pnpm db:migrate          # Run migrations
pnpm db:studio           # Open database UI
pnpm lint                # Lint code
```

## Troubleshooting

### Common Issues

**Ollama not working:**
- Ensure Ollama is running: `ollama list` should show installed models
- Check `OLLAMA_BASE_URL` in `.env` matches your setup
- For Docker: use `http://host.docker.internal:11434`
- For local dev: use `http://localhost:11434`

**No PDFs showing in Dagster:**
- PDFs must be in `data/features/<folder_name>/` structure
- Restart Dagster after adding PDFs

**Database connection errors:**
- Check containers are running: `docker compose ps`
- Verify environment variables match database credentials

**Port conflicts:**
- Check what's using the port: `lsof -i :1337`
- Stop conflicting service or change port in `docker-compose.yml`

**Out of memory:**
- Reduce chunk size in Dagster config
- Use smaller Ollama model (llama3.1:8b instead of 70b)

## Learn More

- [Dagster Docs](https://docs.dagster.io/)
- [Ollama Models](https://ollama.ai/library)
- [pgvector](https://github.com/pgvector/pgvector)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
