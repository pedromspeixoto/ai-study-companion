# study_companion

A Dagster project for processing PDF documents, extracting text, and generating embeddings for RAG (Retrieval-Augmented Generation) applications.

## Features

- 📄 **PDF Discovery**: Automatically discovers all PDF files in configured folders
- 📝 **Text Extraction**: Extracts text content from PDF files using PyPDF
- 💾 **Database Storage**: Saves PDF metadata and extracted text to PostgreSQL
- 🤖 **Embedding Generation**: Generates text embeddings using OpenAI's embedding models via Dagster OpenAI integration
- 🔍 **Vector Storage**: Stores embeddings in PostgreSQL with pgvector extension for similarity search
- 📊 **Automatic Metadata Tracking**: OpenAI usage metrics (tokens, latency, costs) automatically tracked via `dagster-openai`

## Prerequisites

- Python 3.10 or higher
- PostgreSQL database with pgvector extension
- OpenAI API key
- PDF files to process

## Getting started

### Installing dependencies

**Option 1: uv (Recommended)**

Ensure [`uv`](https://docs.astral.sh/uv/) is installed following their [official documentation](https://docs.astral.sh/uv/getting-started/installation/).

Create a virtual environment, and install the required dependencies using _sync_:

```bash
uv sync
```

Then, activate the virtual environment:

| OS | Command |
| --- | --- |
| MacOS | ```source .venv/bin/activate``` |
| Windows | ```.venv\Scripts\activate``` |

**Option 2: pip**

Install the python dependencies with [pip](https://pypi.org/project/pip/):

```bash
python3 -m venv .venv
```

Then activate the virtual environment:

| OS | Command |
| --- | --- |
| MacOS | ```source .venv/bin/activate``` |
| Windows | ```.venv\Scripts\activate``` |

Install the required dependencies:

```bash
pip install -e ".[dev]"
```

### Database Setup

1. **Install PostgreSQL with pgvector extension**

   - **macOS**: `brew install postgresql` and `brew install pgvector`
   - **Linux**: Follow [pgvector installation guide](https://github.com/pgvector/pgvector#installation)
   - **Docker**: Use a PostgreSQL image with pgvector pre-installed

2. **Create a database**:

```sql
CREATE DATABASE study_companion;
```

3. **Set up environment variables**:

Create a `.env` file in the project root:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=study_companion
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
OPENAI_API_KEY=your_openai_api_key
```

**Note:** The database schema (tables and indexes) will be automatically created when you first run Dagster. The `PostgresResource` handles schema initialization automatically.

### Running Dagster

Start the Dagster UI web server:

```bash
uv run dg dev
```

Or if using the standard Dagster CLI:

```bash
uv run dagster dev
```

Open http://localhost:3000 in your browser to see the project.

## Usage

### Processing PDFs

1. **Place your PDF files** in one or more folders on your local system

2. **Materialize the assets** in the Dagster UI:
   - Navigate to the Assets tab
   - Select the `pdf_processing` group
   - Click "Materialize" on the assets you want to run
   - Configure the materialization with:
     - `pdf_folders`: List of folder paths containing PDFs (e.g., `["/path/to/pdfs", "/another/path"]`)
     - `openai_model`: Embedding model to use (default: `"text-embedding-3-small"`)
   
   **Note:** The OpenAI API key is automatically loaded from the `OPENAI_API_KEY` environment variable via the `OpenAIResource`. No need to pass it in the config.

3. **Asset Pipeline**:
   - `discover_pdfs`: Scans configured folders for PDF files
   - `extract_pdf_text`: Extracts text from each discovered PDF
   - `save_resources`: Saves PDF metadata to the `resources` table
   - `generate_embeddings`: Generates embeddings for extracted text using OpenAI
   - `save_embeddings`: Saves embeddings to the `embeddings` table

### Database Schema

The project uses the following PostgreSQL schema:

**resources table**:
- `id`: Unique identifier (MD5 hash of file path)
- `filename`: PDF filename
- `pathname`: Full path to the PDF file
- `content_type`: MIME type (e.g., "application/pdf")
- `status`: Processing status (default: 'PROCESSING', updated to 'COMPLETED')
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update

**embeddings table**:
- `id`: Unique identifier for the embedding
- `resource_id`: Foreign key to resources table
- `content`: Extracted text content
- `embedding`: Vector embedding (1536 dimensions for OpenAI models)

## Configuration

### Environment Variables

- `POSTGRES_HOST`: PostgreSQL host (default: `localhost`)
- `POSTGRES_PORT`: PostgreSQL port (default: `5432`)
- `POSTGRES_DB`: Database name (default: `study_companion`)
- `POSTGRES_USER`: PostgreSQL user (default: `postgres`)
- `POSTGRES_PASSWORD`: PostgreSQL password
- `OPENAI_API_KEY`: Your OpenAI API key (required for embedding generation)

### Asset Configuration

When materializing assets, provide:
- `pdf_folders`: List of absolute paths to folders containing PDFs
- `openai_model`: Embedding model (default: `"text-embedding-3-small"`)

**Note:** The OpenAI API key is configured via the `OPENAI_API_KEY` environment variable and managed through Dagster's `OpenAIResource` for automatic usage tracking and metadata logging.

## Learn more

To learn more about this project and Dagster in general:

- [Dagster Documentation](https://docs.dagster.io/)
- [Dagster University](https://courses.dagster.io/)
- [Dagster Slack Community](https://dagster.io/slack)
- [Dagster OpenAI Integration](https://docs.dagster.io/integrations/libraries/openai)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [pgvector Documentation](https://github.com/pgvector/pgvector)