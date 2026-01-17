"""Resource definitions for the study companion project."""
import os

import psycopg2
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
                context.log.debug("Creating embeddings table...")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS embeddings (
                        id VARCHAR(191) PRIMARY KEY NOT NULL,
                        resource_id VARCHAR(191),
                        content TEXT NOT NULL,
                        embedding vector(1536) NOT NULL,
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
