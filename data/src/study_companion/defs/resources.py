"""Resource definitions for the study companion project."""
import os

import psycopg2
import requests
from dagster import ConfigurableResource, EnvVar, InitResourceContext
from dagster_openai import OpenAIResource


class PostgresResource(ConfigurableResource):
    """PostgreSQL resource for database operations with automatic schema setup."""

    host: str
    port: int = 5432
    database: str
    user: str
    password: str

    def setup_for_execution(self, context: InitResourceContext) -> None:
        """Set up database schema when resource is initialized."""
        super().setup_for_execution(context)
        context.log.info("Setting up database schema...")
        self._setup_schema(context)
        context.log.info("Database schema setup complete!")

    def _setup_schema(self, context: InitResourceContext) -> None:
        """Create the database schema if it doesn't exist."""
        conn = self.get_connection()
        try:
            with conn.cursor() as cur:
                # Enable pgvector extension
                context.log.debug("Enabling pgvector extension...")
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")

                # Create resources table
                context.log.debug("Creating resources table...")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS resources (
                        id VARCHAR(191) PRIMARY KEY NOT NULL,
                        filename TEXT NOT NULL,
                        folder TEXT NOT NULL,
                        pathname TEXT NOT NULL,
                        content_type TEXT NOT NULL,
                        status VARCHAR(64) DEFAULT 'PROCESSING' NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
                    );
                    """
                )

                # Create embeddings table
                # Dimension is determined by the embedding model:
                # - OpenAI text-embedding-3-small: 1536
                # - Ollama nomic-embed-text: 768 (default for Ollama)
                context.log.debug("Creating embeddings table...")

                # Determine embedding dimension
                if os.getenv("OLLAMA_BASE_URL"):
                    # Always use nomic-embed-text (768 dimensions) when Ollama is enabled
                    embedding_dim = 768
                    context.log.info("Using Ollama with nomic-embed-text (768 dimensions)")
                else:
                    # Default to OpenAI dimension if not using Ollama
                    embedding_dim = 1536
                    context.log.info(f"Using OpenAI embedding dimension: {embedding_dim}")
                
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS embeddings (
                        id VARCHAR(191) PRIMARY KEY NOT NULL,
                        resource_id VARCHAR(191),
                        content TEXT NOT NULL,
                        embedding vector({int(embedding_dim)}) NOT NULL,
                        chunk_index INTEGER
                    );
                    """
                )

                # Create indexes for faster lookups
                context.log.debug("Creating indexes...")
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_embeddings_resource_id 
                    ON embeddings(resource_id);
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_embeddings_resource_chunk 
                    ON embeddings(resource_id, chunk_index);
                    """
                )

                conn.commit()
                context.log.info("Database schema initialized successfully")
        except Exception as e:
            conn.rollback()
            context.log.error(f"Error setting up database schema: {str(e)}")
            raise
        finally:
            conn.close()

    def get_connection(self):
        """Get a PostgreSQL connection."""
        return psycopg2.connect(
            host=self.host,
            port=self.port,
            database=self.database,
            user=self.user,
            password=self.password,
        )


def get_postgres_resource() -> PostgresResource:
    """Factory function to create PostgresResource from environment variables."""
    return PostgresResource(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        database=os.getenv("POSTGRES_DB", "ai_rag"),
        user=os.getenv("POSTGRES_USER", "ai_rag"),
        password=os.getenv("POSTGRES_PASSWORD", "ai_rag"),
    )


def get_openai_resource() -> OpenAIResource:
    """Factory function to create OpenAIResource from environment variables."""
    return OpenAIResource(api_key=EnvVar("OPENAI_API_KEY"))


class OllamaResource(ConfigurableResource):
    """Ollama resource for generating embeddings locally.
    
    ALWAYS uses nomic-embed-text for embeddings (768 dimensions).
    This ensures consistency across the entire system.
    
    base_url uses EnvVar to read from OLLAMA_BASE_URL environment variable.
    The default value is used if OLLAMA_BASE_URL is not set.
    """

    base_url: str = EnvVar("OLLAMA_BASE_URL")  # type: ignore
    embedding_model: str = "nomic-embed-text"

    def get_embedding(self, text: str) -> list[float]:
        """
        Generate an embedding using Ollama's embedding API.
        
        nomic-embed-text has a context length of 8192 tokens.
        Rough estimate: 1 token ≈ 4 characters, so max ~32k chars.
        We use a conservative limit of 24k characters to be safe.
        
        Args:
            text: The text to generate an embedding for
            
        Returns:
            List of floats representing the embedding vector
        """
        # Validate input
        if not text:
            raise ValueError("Text cannot be None or empty for embedding generation")
        
        # Ensure text is a string and strip whitespace
        text_str = str(text).strip()
        if not text_str:
            raise ValueError("Text cannot be empty after stripping whitespace")
        
        # nomic-embed-text has 8192 token limit (~32k chars max, but be conservative)
        # Reject if text is too long to prevent API errors
        MAX_CHARS = 24000  # Conservative limit (roughly 6000 tokens, well under 8192)
        if len(text_str) > MAX_CHARS:
            raise ValueError(
                f"Text length ({len(text_str)} chars) exceeds maximum allowed length "
                f"({MAX_CHARS} chars) for nomic-embed-text. Please chunk the text first."
            )
        
        # Normalize base_url - ensure it's a string and remove trailing slash if present
        base_url_str = str(self.base_url).strip().rstrip('/')
        if not base_url_str:
            raise ValueError("OLLAMA_BASE_URL is not set or is empty")
        
        url = f"{base_url_str}/api/embed"
        
        payload = {
            "model": self.embedding_model,
            "input": text_str,  # Ollama uses "input" not "prompt"
        }

        try:
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            # Ollama returns embeddings as a list in "embeddings" field (or "embedding" for single)
            if "embeddings" in data:
                embeddings_list = data["embeddings"]
                if not embeddings_list or len(embeddings_list) == 0:
                    raise ValueError("Ollama returned empty embeddings array")
                return embeddings_list[0]  # Return first embedding if array
            elif "embedding" in data:
                return data["embedding"]
            else:
                raise ValueError(f"Unexpected response format: {list(data.keys())}")
        except requests.exceptions.RequestException as e:
            # Include more details in error message
            error_msg = f"Failed to generate embedding with Ollama: {str(e)}"
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_details = e.response.text[:500]
                    error_msg += f" | Status: {e.response.status_code} | Response: {error_details}"
                except:
                    error_msg += f" | Status: {e.response.status_code}"
            raise RuntimeError(error_msg) from e

    def get_embedding_dimension(self) -> int:
        """
        Get the dimension of embeddings for nomic-embed-text.
        
        Returns:
            Always returns 768 (nomic-embed-text dimension)
        """
        # Always use nomic-embed-text, which has 768 dimensions
        return 768


def get_ollama_resource() -> OllamaResource:
    """Factory function to create OllamaResource using Dagster EnvVar.
    
    ALWAYS uses nomic-embed-text for embeddings.
    base_url uses EnvVar to read from OLLAMA_BASE_URL environment variable.
    If OLLAMA_BASE_URL is not set, will use the default from class definition.
    """
    # Always use EnvVar - Dagster will resolve it at runtime
    # If not set, it will use the default value from the class definition
    return OllamaResource(
        base_url=EnvVar("OLLAMA_BASE_URL"),  # type: ignore
        embedding_model="nomic-embed-text",
    )
