"""PDF processing assets for extracting text and generating embeddings."""
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, TypedDict

from dagster import (
    AssetExecutionContext,
    Config,
    EnvVar,
    StaticPartitionsDefinition,
    asset,
    MaterializeResult,
    MetadataValue,
)
from dagster_openai import OpenAIResource
from pypdf import PdfReader

from study_companion.defs.resources import PostgresResource, OllamaResource

# Get the project root and features directory
_PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
_FEATURES_DIR = _PROJECT_ROOT / "features"


def _discover_feature_folders() -> List[str]:
    """Discover all folders in the features directory."""
    if not _FEATURES_DIR.exists():
        return []
    
    folders = [
        folder.name
        for folder in _FEATURES_DIR.iterdir()
        if folder.is_dir() and not folder.name.startswith(".")
    ]
    return sorted(folders)


# Create partition definition based on folders in features/
feature_folders = _discover_feature_folders()
folder_partitions_def = StaticPartitionsDefinition(feature_folders) if feature_folders else StaticPartitionsDefinition(["default"])


class PDFProcessingConfig(Config):
    """Configuration for PDF processing."""

    openai_model: str = "text-embedding-3-small"  # Used only if OpenAI is configured
    # Chunk sizes: nomic-embed-text has 8192 token limit, OpenAI has 8191 token limit
    # Using conservative estimates: ~4 chars per token, leaving buffer
    #
    chunk_size: int = 4000  # Characters per chunk for OpenAI (roughly 1000 tokens)
    chunk_size_ollama: int = 4000  # Characters per chunk for Ollama/nomic-embed-text (roughly 1000 tokens)
    chunk_overlap: int = 200  # Overlap between chunks to preserve context


class PDFInfo(TypedDict):
    """Type definition for PDF file information."""

    id: str
    filename: str
    folder: str
    pathname: str
    content_type: str


class ExtractedText(TypedDict, total=False):
    """Type definition for extracted PDF text."""

    resource_id: str
    filename: str
    folder: str
    pathname: str
    content_type: str
    text: str
    page_count: int
    error: str


class EmbeddingData(TypedDict):
    """Type definition for embedding data."""

    resource_id: str
    content: str
    embedding: List[float]


# Asset keys for explicit references (using string keys)
DISCOVER_PDFS_KEY = ["pdf_processing", "discover_pdfs"]
EXTRACT_PDF_TEXT_KEY = ["pdf_processing", "extract_pdf_text"]
SAVE_RESOURCES_KEY = ["pdf_processing", "save_resources"]
GENERATE_EMBEDDINGS_KEY = ["pdf_processing", "generate_embeddings"]
SAVE_EMBEDDINGS_KEY = ["pdf_processing", "save_embeddings"]


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """
    Split text into overlapping chunks.
    
    Args:
        text: The text to chunk
        chunk_size: Maximum characters per chunk
        chunk_overlap: Number of characters to overlap between chunks
    
    Returns:
        List of text chunks
    """
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        
        # Move start position forward, accounting for overlap
        start = end - chunk_overlap
        
        # Prevent infinite loop if overlap is too large
        if chunk_overlap >= chunk_size:
            break
    
    return chunks


@asset(
    key=DISCOVER_PDFS_KEY,
    description="Discover all PDF files in the configured folder partition.",
    group_name="pdf_processing",
    partitions_def=folder_partitions_def,
    kinds={"folder"},
)
def discover_pdfs(
    context: AssetExecutionContext, config: PDFProcessingConfig
) -> List[dict]:
    """
    Discover all PDF files in the partition's folder.
    
    Scans the folder corresponding to the current partition recursively for PDF files
    and generates unique IDs based on file paths. Returns list of discovered PDF file information.
    """
    # Get the partition key (folder name)
    try:
        partition_key = context.partition_key
    except Exception:
        available_partitions = folder_partitions_def.get_partition_keys()
        raise ValueError(
            f"This asset requires a partition to be selected. "
            f"Available partitions: {', '.join(available_partitions)}. "
            f"Please select a partition when materializing this asset."
        )
    
    folder_path = _FEATURES_DIR / partition_key
    
    pdf_files: List[PDFInfo] = []
    
    if not folder_path.exists():
        context.log.warning(f"Folder does not exist: {folder_path}")
        context.add_output_metadata(
            {
                "pdfs_discovered": MetadataValue.int(0),
                "folder_path": MetadataValue.path(str(folder_path)),
                "partition": MetadataValue.text(partition_key),
            }
        )
        return pdf_files
    
    context.log.info(f"Scanning folder: {folder_path} (partition: {partition_key})")
    
    for pdf_file in folder_path.rglob("*.pdf"):
        # Generate a unique ID based on file path
        file_id = hashlib.md5(str(pdf_file.absolute()).encode()).hexdigest()
        
        pdf_info: PDFInfo = {
            "id": file_id,
            "filename": pdf_file.name,
            "folder": partition_key,
            "pathname": str(pdf_file.absolute()),
            "content_type": "application/pdf",
        }
        pdf_files.append(pdf_info)
        context.log.info(f"Discovered PDF: {pdf_file.name} ({file_id[:8]}...)")
    
    context.log.info(f"Total PDFs discovered: {len(pdf_files)} in partition '{partition_key}'")
    
    context.add_output_metadata(
        {
            "pdfs_discovered": MetadataValue.int(len(pdf_files)),
            "folder": MetadataValue.text(partition_key),
            "folder_path": MetadataValue.path(str(folder_path)),
            "partition": MetadataValue.text(partition_key),
        }
    )
    
    return pdf_files


@asset(
    key=EXTRACT_PDF_TEXT_KEY,
    description="Extract text content from discovered PDF files using PyPDF.",
    group_name="pdf_processing",
    partitions_def=folder_partitions_def,
    deps=[DISCOVER_PDFS_KEY],
)
def extract_pdf_text(
    context: AssetExecutionContext,
    config: PDFProcessingConfig,
    discover_pdfs: List[dict],
) -> List[dict]:
    """
    Extract text from each discovered PDF file.
    
    Processes each PDF and extracts text content from all pages.
    Handles extraction errors gracefully and tracks success/failure rates.
    """
    extracted_texts: List[ExtractedText] = []
    
    successful_extractions = 0
    failed_extractions = 0
    total_pages = 0
    total_characters = 0
    
    for pdf_info in discover_pdfs:
        pdf_path = Path(pdf_info["pathname"])
        
        try:
            context.log.info(f"Extracting text from: {pdf_info['filename']}")
            
            reader = PdfReader(pdf_path)
            text_content = ""
            
            for page_num, page in enumerate(reader.pages, start=1):
                page_text = page.extract_text()
                text_content += f"\n--- Page {page_num} ---\n{page_text}"
            
            page_count = len(reader.pages)
            char_count = len(text_content)
            
            extracted_text: ExtractedText = {
                "resource_id": pdf_info["id"],
                "filename": pdf_info["filename"],
                "folder": pdf_info["folder"],
                "pathname": pdf_info["pathname"],
                "content_type": pdf_info["content_type"],
                "text": text_content,
                "page_count": page_count,
            }
            extracted_texts.append(extracted_text)
            
            successful_extractions += 1
            total_pages += page_count
            total_characters += char_count
            
            context.log.info(
                f"Extracted {char_count} characters from {page_count} pages "
                f"in {pdf_info['filename']}"
            )
            
        except Exception as e:
            context.log.error(
                f"Error extracting text from {pdf_info['filename']}: {str(e)}"
            )
            failed_extractions += 1
            
            extracted_text: ExtractedText = {
                "resource_id": pdf_info["id"],
                "filename": pdf_info["filename"],
                "folder": pdf_info["folder"],
                "pathname": pdf_info["pathname"],
                "content_type": pdf_info["content_type"],
                "text": "",
                "page_count": 0,
                "error": str(e),
            }
            extracted_texts.append(extracted_text)
    
    # Add metadata about extraction results
    context.add_output_metadata(
        {
            "total_documents": MetadataValue.int(len(extracted_texts)),
            "successful_extractions": MetadataValue.int(successful_extractions),
            "failed_extractions": MetadataValue.int(failed_extractions),
            "total_pages": MetadataValue.int(total_pages),
            "total_characters": MetadataValue.int(total_characters),
            "success_rate": MetadataValue.float(
                float(successful_extractions / len(extracted_texts) * 100) if extracted_texts else 0.0
            ),
        }
    )
    
    return extracted_texts


@asset(
    key=SAVE_RESOURCES_KEY,
    description="Save PDF metadata to the resources table in PostgreSQL.",
    group_name="pdf_processing",
    partitions_def=folder_partitions_def,
    deps=[EXTRACT_PDF_TEXT_KEY],
    kinds={"postgres"},
)
def save_resources(
    context: AssetExecutionContext,
    config: PDFProcessingConfig,
    postgres: PostgresResource,
    extract_pdf_text: List[dict],
) -> MaterializeResult:
    """
    Save PDF resources to the database.
    
    Inserts or updates resource records in the PostgreSQL resources table.
    Tracks saved vs updated records for observability.
    """
    
    conn = postgres.get_connection()
    saved_count = 0
    updated_count = 0
    error_count = 0
    
    try:
        with conn.cursor() as cur:
            for pdf_data in extract_pdf_text:
                try:
                    # Check if resource already exists
                    cur.execute(
                        "SELECT id FROM resources WHERE id = %s",
                        (pdf_data["resource_id"],),
                    )
                    exists = cur.fetchone()
                    
                    if exists:
                        # Update existing resource
                        cur.execute(
                            """
                            UPDATE resources 
                            SET filename = %s, 
                                folder = %s,
                                pathname = %s, 
                                content_type = %s,
                                status = 'COMPLETED',
                                updated_at = NOW()
                            WHERE id = %s
                            """,
                            (
                                pdf_data["filename"],
                                pdf_data["folder"],
                                pdf_data["pathname"],
                                pdf_data["content_type"],
                                pdf_data["resource_id"],
                            ),
                        )
                        updated_count += 1
                    else:
                        # Insert new resource
                        cur.execute(
                            """
                            INSERT INTO resources (id, filename, folder, pathname, content_type, status)
                            VALUES (%s, %s, %s, %s, %s, 'COMPLETED')
                            """,
                            (
                                pdf_data["resource_id"],
                                pdf_data["filename"],
                                pdf_data["folder"],
                                pdf_data["pathname"],
                                pdf_data["content_type"],
                            ),
                        )
                        saved_count += 1
                    
                    context.log.debug(
                        f"{'Updated' if exists else 'Saved'} resource: {pdf_data['filename']}"
                    )
                except Exception as e:
                    error_count += 1
                    context.log.error(
                        f"Error saving resource {pdf_data.get('filename', 'unknown')}: {str(e)}"
                    )
            
            conn.commit()
            
    except Exception as e:
        conn.rollback()
        context.log.error(f"Error in database transaction: {str(e)}")
        raise
    finally:
        conn.close()
    
    # If all resources failed to save, raise an error
    if error_count > 0 and (saved_count + updated_count) == 0:
        error_msg = (
            f"Failed to save all {len(extract_pdf_text)} resources. "
            f"All {error_count} attempts resulted in errors."
        )
        context.log.error(error_msg)
        raise ValueError(error_msg)
    
    # If some resources failed, log a warning but don't fail
    if error_count > 0:
        context.log.warning(
            f"Failed to save {error_count} out of {len(extract_pdf_text)} resources. "
            f"Successfully saved {saved_count} and updated {updated_count}."
        )
    
    return MaterializeResult(
        metadata={
            "saved": MetadataValue.int(saved_count),
            "updated": MetadataValue.int(updated_count),
            "errors": MetadataValue.int(error_count),
            "total": MetadataValue.int(len(extract_pdf_text)),
            "timestamp": MetadataValue.timestamp(datetime.now().timestamp()),
        }
    )


@asset(
    key=GENERATE_EMBEDDINGS_KEY,
    description="Generate text embeddings using OpenAI or Ollama embedding models.",
    group_name="pdf_processing",
    partitions_def=folder_partitions_def,
    deps=[EXTRACT_PDF_TEXT_KEY],
    kinds={"openai", "llama"},
)
def generate_embeddings(
    context: AssetExecutionContext,
    config: PDFProcessingConfig,
    extract_pdf_text: List[dict],
    ollama_resource: OllamaResource,
    openai_resource: OpenAIResource,
) -> List[dict]:
    """
    Generate embeddings for each PDF's extracted text using OpenAI or Ollama.
    
    Creates vector embeddings for successful text extractions.
    Large texts are automatically chunked to fit within token limits.
    Skips PDFs that failed text extraction.
    
    Automatically selects provider based on available resources:
    - Uses Ollama if ollama_resource is provided
    - Falls back to OpenAI if openai_resource is provided
    """
    embeddings_data: List[dict] = []
    
    successful_embeddings = 0
    skipped_embeddings = 0
    failed_embeddings = 0
    total_chunks = 0
    
    # Determine which provider to use
    # Priority: Ollama if OLLAMA_BASE_URL is set, otherwise OpenAI if OPENAI_API_KEY is set
    # Check if OLLAMA_BASE_URL environment variable is actually set
    ollama_base_url = EnvVar("OLLAMA_BASE_URL").get_value(default="")
    use_ollama = bool(ollama_base_url and ollama_base_url.strip())
    use_openai = not use_ollama and openai_resource is not None
    
    if use_ollama:
        context.log.info(f"Using Ollama for embeddings: {ollama_resource.embedding_model}")
    elif use_openai:
        context.log.info(f"Using OpenAI for embeddings: {config.openai_model}")
    else:
        raise ValueError(
            "Neither OpenAI nor Ollama resource is configured. "
            "Set OPENAI_API_KEY or OLLAMA_BASE_URL environment variable."
        )
    
    for pdf_data in extract_pdf_text:
        if not pdf_data.get("text") or pdf_data.get("error"):
            context.log.warning(
                f"Skipping embedding generation for {pdf_data['filename']} "
                "due to extraction error"
            )
            skipped_embeddings += 1
            continue
        
        try:
            text = pdf_data["text"]
            text_length = len(text)
            
            # Use provider-specific chunk size
            chunk_size = config.chunk_size_ollama if use_ollama else config.chunk_size
            
            # Chunk the text if it's too long
            chunks = _chunk_text(text, chunk_size, config.chunk_overlap)
            num_chunks = len(chunks)
            
            if num_chunks > 1:
                context.log.info(
                    f"Chunking {pdf_data['filename']} into {num_chunks} chunks "
                    f"(text length: {text_length} chars, chunk size: {chunk_size} chars)"
                )
            
            # Generate embedding for each chunk
            chunks_processed = 0
            embedding_dim = 0
            for chunk_idx, chunk in enumerate(chunks):
                try:
                    context.log.debug(
                        f"Generating embedding for chunk {chunk_idx + 1}/{num_chunks} "
                        f"of {pdf_data['filename']} ({len(chunk)} chars)"
                    )
                    
                    # Generate embedding using selected provider
                    if use_ollama:
                        embedding_vector = ollama_resource.get_embedding(chunk)
                    else:
                        with openai_resource.get_client(context) as client:  # type: ignore
                            response = client.embeddings.create(
                                model=config.openai_model,
                                input=chunk,
                            )
                            embedding_vector = response.data[0].embedding
                    
                    embedding_dim = len(embedding_vector)
                    
                    # Store chunk with metadata
                    embedding_data: dict = {
                        "resource_id": pdf_data["resource_id"],
                        "content": chunk,
                        "embedding": embedding_vector,
                        "chunk_index": chunk_idx if num_chunks > 1 else None,
                        "total_chunks": num_chunks if num_chunks > 1 else None,
                    }
                    embeddings_data.append(embedding_data)
                    total_chunks += 1
                    chunks_processed += 1
                    
                except Exception as chunk_error:
                    context.log.error(
                        f"Error generating embedding for chunk {chunk_idx + 1}/{num_chunks} "
                        f"of {pdf_data['filename']}: {str(chunk_error)}"
                    )
                    failed_embeddings += 1
                    # Continue with next chunk even if one fails
                    continue
            
            if chunks_processed > 0:
                successful_embeddings += 1
                context.log.info(
                    f"Generated {chunks_processed}/{num_chunks} embedding(s) (dim={embedding_dim}) "
                    f"for {pdf_data['filename']}"
                )
            
        except Exception as e:
            failed_embeddings += 1
            context.log.error(
                f"Error processing {pdf_data['filename']}: {str(e)}"
            )
    
    # Add metadata about embedding generation results
    embedding_dimension = len(embeddings_data[0]["embedding"]) if embeddings_data else 0
    context.add_output_metadata(
        {
            "total_embeddings": MetadataValue.int(len(embeddings_data)),
            "total_chunks": MetadataValue.int(total_chunks),
            "successful_embeddings": MetadataValue.int(successful_embeddings),
            "skipped_embeddings": MetadataValue.int(skipped_embeddings),
            "failed_embeddings": MetadataValue.int(failed_embeddings),
            "embedding_dimension": MetadataValue.int(embedding_dimension),
            "provider": MetadataValue.text("ollama" if use_ollama else "openai"),
        }
    )
    
    return embeddings_data


@asset(
    key=SAVE_EMBEDDINGS_KEY,
    description="Save generated embeddings to the embeddings table in PostgreSQL.",
    group_name="pdf_processing",
    partitions_def=folder_partitions_def,
    deps=[GENERATE_EMBEDDINGS_KEY],
    kinds={"postgres"},
)
def save_embeddings(
    context: AssetExecutionContext,
    config: PDFProcessingConfig,
    postgres: PostgresResource,
    generate_embeddings: List[dict],
) -> MaterializeResult:
    """
    Save embeddings to the database.
    
    Stores vector embeddings in the PostgreSQL embeddings table with pgvector.
    Each chunk from a PDF gets its own embedding record.
    Deletes existing embeddings for each resource_id before inserting new ones
    to ensure idempotency and prevent duplicates on re-runs.
    """
    
    conn = postgres.get_connection()
    saved_count = 0
    error_count = 0
    
    try:
        with conn.cursor() as cur:
            # Group embeddings by resource_id to delete all chunks for a resource at once
            resource_ids = set(embedding_data["resource_id"] for embedding_data in generate_embeddings)
            
            # Delete existing embeddings for all resources being processed
            for resource_id in resource_ids:
                try:
                    cur.execute(
                        "DELETE FROM embeddings WHERE resource_id = %s",
                        (resource_id,),
                    )
                    deleted_count = cur.rowcount
                    if deleted_count > 0:
                        context.log.debug(
                            f"Deleted {deleted_count} existing embedding(s) for resource: {resource_id[:8]}..."
                        )
                except Exception as e:
                    context.log.warning(
                        f"Error deleting existing embeddings for resource {resource_id[:8]}...: {str(e)}"
                    )
            
            # Insert all new embeddings
            for embedding_data in generate_embeddings:
                try:
                    embedding_id = str(uuid.uuid4())
                    
                    # Convert embedding list to string format for pgvector: '[1,2,3]'
                    embedding_str = (
                        "[" + ",".join(str(x) for x in embedding_data["embedding"]) + "]"
                    )
                    
                    # Get chunk_index (defaults to 0 if not set, for single-chunk PDFs)
                    chunk_index = embedding_data.get("chunk_index")
                    if chunk_index is None:
                        chunk_index = 0
                    
                    # Insert new embedding with chunk_index for proper ordering
                    cur.execute(
                        """
                        INSERT INTO embeddings (id, resource_id, content, embedding, chunk_index)
                        VALUES (%s, %s, %s, %s::vector, %s)
                        """,
                        (
                            embedding_id,
                            embedding_data["resource_id"],
                            embedding_data["content"],
                            embedding_str,
                            chunk_index,
                        ),
                    )
                    saved_count += 1
                    
                    context.log.debug(
                        f"Saved embedding chunk {chunk_index} for resource: {embedding_data['resource_id'][:8]}..."
                    )
                except Exception as e:
                    error_count += 1
                    context.log.error(
                        f"Error saving embedding for resource "
                        f"{embedding_data['resource_id']}: {str(e)}"
                    )
            
            conn.commit()
            
    except Exception as e:
        conn.rollback()
        context.log.error(f"Error in database transaction: {str(e)}")
        raise
    finally:
        conn.close()
    
    # If all embeddings failed to save, raise an error
    if error_count > 0 and saved_count == 0:
        error_msg = (
            f"Failed to save all {len(generate_embeddings)} embeddings. "
            f"All {error_count} attempts resulted in errors."
        )
        context.log.error(error_msg)
        raise ValueError(error_msg)
    
    # If some embeddings failed, log a warning but don't fail
    if error_count > 0:
        context.log.warning(
            f"Failed to save {error_count} out of {len(generate_embeddings)} embeddings. "
            f"Successfully saved {saved_count}."
        )
    
    return MaterializeResult(
        metadata={
            "saved": MetadataValue.int(saved_count),
            "errors": MetadataValue.int(error_count),
            "total": MetadataValue.int(len(generate_embeddings)),
            "timestamp": MetadataValue.timestamp(datetime.now().timestamp()),
        }
    )
