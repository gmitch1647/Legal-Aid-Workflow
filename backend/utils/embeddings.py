"""
Embeddings utility — Voyage AI wrapper for RAG retrieval.

Uses `voyage-law-2` (domain-specialized for legal text) if available,
otherwise falls back to `voyage-3` (general purpose). Both produce
1024-dimension vectors that match the pgvector column in migration 004.

Requires VOYAGE_API_KEY in the environment. Get a free key at
https://www.voyageai.com — first 200M tokens are free.
"""

import logging
import os
from typing import List, Optional

logger = logging.getLogger(__name__)

# Prefer the legal-specialized model when available
EMBEDDING_MODEL = os.environ.get("VOYAGE_MODEL", "voyage-law-2")
EMBEDDING_DIM = 1024

_client = None


def _get_client():
    """Lazy-initialize the Voyage client so the app boots even if the
    key isn't set yet."""
    global _client
    if _client is None:
        try:
            import voyageai
        except ImportError as e:
            raise RuntimeError(
                "voyageai package not installed. Add `voyageai` to "
                "backend/requirements.txt and redeploy."
            ) from e

        api_key = os.environ.get("VOYAGE_API_KEY")
        if not api_key:
            raise RuntimeError(
                "VOYAGE_API_KEY environment variable is not set. "
                "Get a free API key at https://www.voyageai.com and add "
                "it to your Railway service variables."
            )
        _client = voyageai.Client(api_key=api_key)
    return _client


def embed_text(text: str) -> List[float]:
    """Embed a single string and return a 1024-dim vector."""
    if not text or not text.strip():
        raise ValueError("Cannot embed empty text")
    client = _get_client()
    try:
        result = client.embed(
            [text],
            model=EMBEDDING_MODEL,
            input_type="query",
        )
        return result.embeddings[0]
    except Exception as e:
        logger.error(f"Embedding failed for query: {e}")
        raise


def embed_documents(texts: List[str], batch_size: int = 128) -> List[List[float]]:
    """Embed multiple documents in batches. Returns a list of vectors
    in the same order as the input texts."""
    if not texts:
        return []

    client = _get_client()
    all_embeddings: List[List[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        # Skip empty chunks
        batch = [t for t in batch if t and t.strip()]
        if not batch:
            continue
        try:
            result = client.embed(
                batch,
                model=EMBEDDING_MODEL,
                input_type="document",
            )
            all_embeddings.extend(result.embeddings)
        except Exception as e:
            logger.error(f"Batch embedding failed at offset {i}: {e}")
            raise

    return all_embeddings


def is_configured() -> bool:
    """Return True if Voyage credentials are set."""
    return bool(os.environ.get("VOYAGE_API_KEY"))
