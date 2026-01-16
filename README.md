# AI Study Companion

<div align="center">
  <img src="assets/small-demo.gif" alt="Study Companion Demo" width="1024"/>
</div>

## Table of Contents
- [Overview](#-overview)
- [Architecture](#-architecture)
- [Key Components](#-key-components)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Database Schema](#-database-schema)
- [How It Works](#-how-it-works)

A comprehensive RAG (Retrieval-Augmented Generation) application that efficiently processes PDF documents and provides an intelligent chat interface for querying information using multiple AI models.

## 🎯 Overview

Study Companion consists of two main components:

1. **Dagster Pipeline** (`data/`): A robust data processing pipeline that reads PDF files, extracts text, and generates vector embeddings for efficient semantic search.
2. **Next.js Application** (`frontend/`): A modern web interface that allows users to query processed documents using different AI models (GPT-4, GPT-4o) with RAG capabilities.

## 🏗️ Architecture

```mermaid
graph TB
    subgraph "Data Processing Pipeline (Dagster)"
        A[PDF Files] -->|Discover| B[discover_pdfs]
        B -->|Extract Text| C[extract_pdf_text]
        C -->|Save Metadata| D[save_resources]
        C -->|Generate Embeddings| E[generate_embeddings]
        E -->|Save Vectors| F[save_embeddings]
    end
    
    subgraph "Storage Layer"
        D -->|Metadata| G[(PostgreSQL<br/>+ pgvector)]
        F -->|Embeddings| G
    end
    
    subgraph "Next.js Application"
        H[User Query] -->|Generate Query Embedding| I[OpenAI Embedding API]
        I -->|Vector Search| G
        G -->|Retrieve Context| J[RAG Tool]
        J -->|Augment Prompt| K[AI Models]
        K -->|Response| L[User Interface]
    end
    
    subgraph "AI Models"
        K --> M[GPT-4o RAG]
        K --> N[GPT-4 Chat]
        K --> O[GPT-4o Reasoning]
    end
    
    style A fill:#e1f5ff
    style G fill:#fff4e1
    style K fill:#e8f5e9
    style L fill:#f3e5f5
```

### Key Components

- **PDF Processing**: Automatically discovers PDFs in partitioned folders, extracts text using PyPDF, and handles errors gracefully
- **Embedding Generation**: Uses OpenAI's `text-embedding-3-small` model to create vector embeddings with automatic chunking for large documents
- **Vector Storage**: PostgreSQL with pgvector extension for efficient similarity search
- **RAG Implementation**: Semantic search retrieves relevant document chunks to augment AI responses
- **Multi-Model Support**: Choose between different AI models optimized for various use cases

## 📋 Prerequisites

- **Python 3.10+** (for Dagster pipeline)
- **Node.js 18+** (for Next.js app)
- **PostgreSQL** with pgvector extension
- **OpenAI API Key** (for embeddings and chat models)
- **pnpm** (package manager for frontend)
- **uv** (recommended) or **pip** (for Python dependencies)

## 🚀 Quick Start

### 1. Clone and Navigate

```bash
git clone <repository-url>
cd study-companion
```

### 2. Database Setup

Start PostgreSQL with pgvector using Docker Compose:

```bash
docker compose up -d
```

This starts:
- PostgreSQL with pgvector on port `5432`
- Redis on port `6379` (for resumable streams)
- pgweb on port `8081` (database admin UI)

### 3. Environment Variables

#### For Dagster Pipeline (`data/`)

Create a `.env` file in the `data/` directory:

```bash
cd data
```

```env
# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ai_rag
POSTGRES_USER=ai_rag
POSTGRES_PASSWORD=ai_rag

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
```

#### For Next.js App (`frontend/`)

Create a `.env.local` file in the `frontend/` directory:

```bash
cd frontend
```

```env
# Database
POSTGRES_URL=postgresql://ai_rag:ai_rag@localhost:5432/ai_rag

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Authentication
AUTH_SECRET=generate_a_random_secret_here

# Optional: Redis for resumable streams
REDIS_URL=redis://localhost:6379
```

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

## 🔧 Configuration

### Dagster Pipeline Configuration

When materializing assets in Dagster, you can configure:

- **`openai_model`**: Embedding model (default: `"text-embedding-3-small"`)
- **`chunk_size`**: Characters per chunk (default: `20000`)
- **`chunk_overlap`**: Overlap between chunks (default: `500`)

### Next.js Model Configuration

The app supports three models (defined in `frontend/lib/ai/models.ts`):

1. **RAG Model** (`rag-model`): Uses embeddings to search documents before answering
2. **Chat Model** (`chat-model`): General-purpose GPT-4 chat
3. **Reasoning Model** (`chat-model-reasoning`): GPT-4o with enhanced reasoning

To add a new model, see the frontend README for detailed instructions.

## 📊 Database Schema

### Resources Table
Stores PDF metadata:
- `id`: Unique identifier (MD5 hash of file path)
- `filename`: PDF filename
- `folder`: Folder/partition name
- `pathname`: Full path to the PDF file
- `content_type`: MIME type
- `status`: Processing status
- `created_at`, `updated_at`: Timestamps

### Embeddings Table
Stores vector embeddings:
- `id`: Unique identifier for the embedding
- `resource_id`: Foreign key to resources table
- `content`: Extracted text content (chunk)
- `embedding`: Vector embedding (1536 dimensions)

## 🔍 How It Works

### Processing Flow

1. **PDF Discovery**: Dagster scans configured folders for PDF files
2. **Text Extraction**: PyPDF extracts text from each PDF page
3. **Chunking**: Large texts are split into overlapping chunks (20k chars with 500 char overlap)
4. **Embedding Generation**: OpenAI API generates vector embeddings for each chunk
5. **Storage**: Embeddings are stored in PostgreSQL with pgvector for similarity search

### Query Flow

1. **User Query**: User enters a question in the chat interface
2. **Query Embedding**: The query is converted to a vector embedding
3. **Similarity Search**: pgvector finds the most similar document chunks (cosine similarity > 0.2)
4. **Context Retrieval**: Top 4 most relevant chunks are retrieved
5. **RAG Augmentation**: Retrieved context is added to the prompt
6. **AI Response**: The selected model generates a response based on the augmented context

## 🛠️ Development

### Dagster Development

- **View logs**: Check the Dagster UI for asset execution logs
- **Debug assets**: Use `context.log` statements in asset functions
- **Monitor usage**: OpenAI usage metrics are automatically tracked by `dagster-openai`

### Next.js Development

- **Database migrations**: `pnpm db:generate` to create migrations, `pnpm db:migrate` to apply
- **Linting**: `pnpm lint` (uses Biome)
- **Formatting**: `pnpm format`
- **Database studio**: `pnpm db:studio` to open Drizzle Studio

## 📝 Scripts Reference

### Dagster (`data/`)

- `dagster dev`: Start Dagster development server
- `dagster asset materialize`: Materialize assets from CLI

### Next.js (`frontend/`)

- `pnpm dev`: Start development server (port 1337)
- `pnpm build`: Build for production
- `pnpm db:migrate`: Run database migrations
- `pnpm db:generate`: Generate migration files
- `pnpm db:studio`: Open Drizzle Studio
- `pnpm lint`: Run linter
- `pnpm format`: Format code

## 🐛 Troubleshooting

### Dagster Issues

- **No partitions available**: Ensure PDF files are in `data/features/<folder_name>/`
- **Database connection errors**: Verify PostgreSQL is running and environment variables are correct
- **OpenAI API errors**: Check your API key and rate limits

### Next.js Issues

- **Database connection errors**: Ensure Docker containers are running (`docker compose ps`)
- **Migration errors**: Run `pnpm db:migrate` to ensure schema is up to date
- **Port conflicts**: Change the port in `package.json` scripts or `.env.local`

## 📚 Learn More

- [Dagster Documentation](https://docs.dagster.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
