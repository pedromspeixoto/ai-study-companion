"""Asset checks for validating data structures in PDF processing assets."""
from typing import Any

from dagster import AssetCheckExecutionContext, AssetCheckResult, MetadataValue, asset_check

from study_companion.defs.assets import (
    DISCOVER_PDFS_KEY,
    EXTRACT_PDF_TEXT_KEY,
    GENERATE_EMBEDDINGS_KEY,
)


def validate_pdf_info(data: dict) -> tuple[bool, str]:
    """Validate that a dict matches the PDFInfo structure. Returns (is_valid, error_message)."""
    required_keys = {"id", "filename", "pathname", "content_type"}
    missing_keys = required_keys - set(data.keys())
    if missing_keys:
        return False, f"PDFInfo missing required keys: {missing_keys}"
    
    # Type checks
    if not isinstance(data["id"], str):
        return False, f"PDFInfo.id must be str, got {type(data['id'])}"
    if not isinstance(data["filename"], str):
        return False, f"PDFInfo.filename must be str, got {type(data['filename'])}"
    if not isinstance(data["pathname"], str):
        return False, f"PDFInfo.pathname must be str, got {type(data['pathname'])}"
    if not isinstance(data["content_type"], str):
        return False, f"PDFInfo.content_type must be str, got {type(data['content_type'])}"
    
    return True, ""


def validate_extracted_text(data: dict) -> tuple[bool, str]:
    """Validate that a dict matches the ExtractedText structure. Returns (is_valid, error_message)."""
    required_keys = {"resource_id", "filename", "pathname", "content_type"}
    missing_keys = required_keys - set(data.keys())
    if missing_keys:
        return False, f"ExtractedText missing required keys: {missing_keys}"
    
    # Type checks for required fields
    if not isinstance(data["resource_id"], str):
        return False, f"ExtractedText.resource_id must be str, got {type(data['resource_id'])}"
    if not isinstance(data["filename"], str):
        return False, f"ExtractedText.filename must be str, got {type(data['filename'])}"
    if not isinstance(data["pathname"], str):
        return False, f"ExtractedText.pathname must be str, got {type(data['pathname'])}"
    if not isinstance(data["content_type"], str):
        return False, f"ExtractedText.content_type must be str, got {type(data['content_type'])}"
    
    # Optional fields type checks
    if "text" in data and not isinstance(data["text"], str):
        return False, f"ExtractedText.text must be str, got {type(data['text'])}"
    if "page_count" in data and not isinstance(data["page_count"], int):
        return False, f"ExtractedText.page_count must be int, got {type(data['page_count'])}"
    if "error" in data and not isinstance(data["error"], str):
        return False, f"ExtractedText.error must be str, got {type(data['error'])}"
    
    return True, ""


def validate_embedding_data(data: dict) -> tuple[bool, str]:
    """Validate that a dict matches the EmbeddingData structure. Returns (is_valid, error_message)."""
    required_keys = {"resource_id", "content", "embedding"}
    missing_keys = required_keys - set(data.keys())
    if missing_keys:
        return False, f"EmbeddingData missing required keys: {missing_keys}"
    
    # Type checks
    if not isinstance(data["resource_id"], str):
        return False, f"EmbeddingData.resource_id must be str, got {type(data['resource_id'])}"
    if not isinstance(data["content"], str):
        return False, f"EmbeddingData.content must be str, got {type(data['content'])}"
    if not isinstance(data["embedding"], list):
        return False, f"EmbeddingData.embedding must be list, got {type(data['embedding'])}"
    if data["embedding"] and not all(isinstance(x, (int, float)) for x in data["embedding"]):
        return False, "EmbeddingData.embedding must contain only numbers"
    
    # Optional chunk metadata validation
    if "chunk_index" in data and data["chunk_index"] is not None:
        if not isinstance(data["chunk_index"], int):
            return False, f"EmbeddingData.chunk_index must be int or None, got {type(data['chunk_index'])}"
    if "total_chunks" in data and data["total_chunks"] is not None:
        if not isinstance(data["total_chunks"], int):
            return False, f"EmbeddingData.total_chunks must be int or None, got {type(data['total_chunks'])}"
    
    return True, ""


@asset_check(asset=DISCOVER_PDFS_KEY, name="pdf_info_structure_check")
def check_pdf_info_structure(
    context: AssetCheckExecutionContext, discover_pdfs: Any = None
) -> AssetCheckResult:
    """Check that all PDF info structures match the expected schema."""
    # Handle case where partition is not materialized
    if discover_pdfs is None:
        try:
            partition_key = context.partition_key
            return AssetCheckResult(
                passed=True,
                metadata={
                    "message": MetadataValue.text(f"Partition '{partition_key}' not materialized, skipping check"),
                    "partition": MetadataValue.text(partition_key),
                },
            )
        except Exception:
            return AssetCheckResult(
                passed=True,
                metadata={
                    "message": MetadataValue.text("No data available for check"),
                },
            )
    
    # Extract data for current partition if input is a dictionary (partitioned asset)
    try:
        partition_key = context.partition_key
        if isinstance(discover_pdfs, dict):
            # IO manager returned all partitions as a dict, extract current partition
            if partition_key not in discover_pdfs:
                return AssetCheckResult(
                    passed=True,
                    metadata={
                        "message": MetadataValue.text(f"Partition '{partition_key}' not found in loaded data"),
                        "partition": MetadataValue.text(partition_key),
                    },
                )
            data_to_check = discover_pdfs[partition_key]
        else:
            # Single partition or non-partitioned asset
            data_to_check = discover_pdfs
    except Exception:
        # No partition key, assume single partition
        data_to_check = discover_pdfs if isinstance(discover_pdfs, list) else []
    
    if not isinstance(data_to_check, list):
        return AssetCheckResult(
            passed=False,
            metadata={
                "error": MetadataValue.text(f"Expected list, got {type(data_to_check)}"),
            },
        )
    
    errors = []
    
    for idx, pdf_info in enumerate(data_to_check):
        is_valid, error_msg = validate_pdf_info(pdf_info)
        if not is_valid:
            errors.append(f"Item {idx}: {error_msg}")
    
    passed = len(errors) == 0
    error_count = len(errors)
    
    return AssetCheckResult(
        passed=passed,
        metadata={
            "total_items": MetadataValue.int(len(data_to_check)),
            "valid_items": MetadataValue.int(len(data_to_check) - error_count),
            "invalid_items": MetadataValue.int(error_count),
            "errors": MetadataValue.json(errors) if errors else MetadataValue.json([]),
        },
    )


@asset_check(asset=EXTRACT_PDF_TEXT_KEY, name="extracted_text_structure_check")
def check_extracted_text_structure(
    context: AssetCheckExecutionContext, extract_pdf_text: Any = None
) -> AssetCheckResult:
    """Check that all extracted text structures match the expected schema."""
    # Handle case where partition is not materialized (data loading failed)
    if extract_pdf_text is None:
        try:
            partition_key = context.partition_key
            return AssetCheckResult(
                passed=True,
                metadata={
                    "message": MetadataValue.text(f"Partition '{partition_key}' not materialized, skipping check"),
                    "partition": MetadataValue.text(partition_key),
                },
            )
        except Exception:
            return AssetCheckResult(
                passed=True,
                metadata={
                    "message": MetadataValue.text("No data available for check"),
                },
            )
    
    # Extract data for current partition if input is a dictionary (partitioned asset)
    try:
        partition_key = context.partition_key
        if isinstance(extract_pdf_text, dict):
            # IO manager returned all partitions as a dict, extract current partition
            if partition_key not in extract_pdf_text:
                return AssetCheckResult(
                    passed=True,
                    metadata={
                        "message": MetadataValue.text(f"Partition '{partition_key}' not found in loaded data"),
                        "partition": MetadataValue.text(partition_key),
                    },
                )
            data_to_check = extract_pdf_text[partition_key]
        else:
            # Single partition or non-partitioned asset
            data_to_check = extract_pdf_text
    except Exception:
        # No partition key, assume single partition
        data_to_check = extract_pdf_text if isinstance(extract_pdf_text, list) else []
    
    if not isinstance(data_to_check, list):
        return AssetCheckResult(
            passed=False,
            metadata={
                "error": MetadataValue.text(f"Expected list, got {type(data_to_check)}"),
            },
        )
    
    errors = []
    
    for idx, extracted_text in enumerate(data_to_check):
        is_valid, error_msg = validate_extracted_text(extracted_text)
        if not is_valid:
            errors.append(f"Item {idx}: {error_msg}")
    
    passed = len(errors) == 0
    error_count = len(errors)
    
    return AssetCheckResult(
        passed=passed,
        metadata={
            "total_items": MetadataValue.int(len(data_to_check)),
            "valid_items": MetadataValue.int(len(data_to_check) - error_count),
            "invalid_items": MetadataValue.int(error_count),
            "errors": MetadataValue.json(errors) if errors else MetadataValue.json([]),
        },
    )


@asset_check(asset=GENERATE_EMBEDDINGS_KEY, name="embedding_data_structure_check")
def check_embedding_data_structure(
    context: AssetCheckExecutionContext, generate_embeddings: Any = None
) -> AssetCheckResult:
    """Check that all embedding data structures match the expected schema."""
    # Handle case where partition is not materialized
    if generate_embeddings is None:
        try:
            partition_key = context.partition_key
            return AssetCheckResult(
                passed=True,
                metadata={
                    "message": MetadataValue.text(f"Partition '{partition_key}' not materialized, skipping check"),
                    "partition": MetadataValue.text(partition_key),
                },
            )
        except Exception:
            return AssetCheckResult(
                passed=True,
                metadata={
                    "message": MetadataValue.text("No data available for check"),
                },
            )
    
    # Extract data for current partition if input is a dictionary (partitioned asset)
    try:
        partition_key = context.partition_key
        if isinstance(generate_embeddings, dict):
            # IO manager returned all partitions as a dict, extract current partition
            if partition_key not in generate_embeddings:
                return AssetCheckResult(
                    passed=True,
                    metadata={
                        "message": MetadataValue.text(f"Partition '{partition_key}' not found in loaded data"),
                        "partition": MetadataValue.text(partition_key),
                    },
                )
            data_to_check = generate_embeddings[partition_key]
        else:
            # Single partition or non-partitioned asset
            data_to_check = generate_embeddings
    except Exception:
        # No partition key, assume single partition
        data_to_check = generate_embeddings if isinstance(generate_embeddings, list) else []
    
    if not isinstance(data_to_check, list):
        return AssetCheckResult(
            passed=False,
            metadata={
                "error": MetadataValue.text(f"Expected list, got {type(data_to_check)}"),
            },
        )
    
    errors = []
    
    for idx, embedding_data in enumerate(data_to_check):
        is_valid, error_msg = validate_embedding_data(embedding_data)
        if not is_valid:
            errors.append(f"Item {idx}: {error_msg}")
    
    passed = len(errors) == 0
    error_count = len(errors)
    
    return AssetCheckResult(
        passed=passed,
        metadata={
            "total_items": MetadataValue.int(len(data_to_check)),
            "valid_items": MetadataValue.int(len(data_to_check) - error_count),
            "invalid_items": MetadataValue.int(error_count),
            "errors": MetadataValue.json(errors) if errors else MetadataValue.json([]),
        },
    )
