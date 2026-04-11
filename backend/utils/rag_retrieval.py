"""
RAG Retrieval — query pgvector for the reference chunks most relevant
to a drafting task.

Used by the complaint_drafter agent (and any other agent that needs
grounded legal context) to pull the best matching ~8 chunks from the
reference_chunks table at draft time, instead of loading whole files.
"""

import logging
from typing import List, Optional

logger = logging.getLogger(__name__)


def retrieve_relevant_chunks(
    query_text: str,
    top_k: int = 8,
    document_type: Optional[str] = None,
    statute_tag: Optional[str] = None,
) -> List[dict]:
    """Return the top_k most semantically similar reference chunks.

    Parameters
    ----------
    query_text : str
        The text to search against — typically the user's case facts
        plus defendant names.
    top_k : int
        How many chunks to return.
    document_type : str, optional
        Filter to a specific document type ('complaint', 'motion',
        'discovery', 'response', 'guide').
    statute_tag : str, optional
        Filter to chunks tagged with a specific statute ('FCRA',
        'FDCPA', 'TCPA', 'GA_FBPA', 'WILLFUL').

    Returns
    -------
    list of dicts
        Each dict has keys: source_file, chunk_index, chunk_text,
        document_type, statute_tags, defendants, similarity
    """
    from utils.supabase_client import get_supabase
    from utils.embeddings import embed_text, is_configured

    if not is_configured():
        logger.warning("Voyage API key not configured — RAG disabled")
        return []

    if not query_text or not query_text.strip():
        return []

    try:
        query_vector = embed_text(query_text)
    except Exception as e:
        logger.error(f"Failed to embed query: {e}")
        return []

    supabase = get_supabase()

    try:
        # Call the SQL function defined in migration 004
        result = supabase.rpc(
            "match_reference_chunks",
            {
                "query_embedding": query_vector,
                "match_count": top_k,
                "filter_document_type": document_type,
                "filter_statute_tag": statute_tag,
            },
        ).execute()
    except Exception as e:
        logger.error(f"pgvector query failed: {e}")
        return []

    chunks = result.data or []
    logger.info(f"RAG retrieved {len(chunks)} chunks for query")
    return chunks


def format_retrieved_context(chunks: List[dict]) -> str:
    """Format retrieved chunks into a string suitable for injection
    into a Claude system prompt."""
    if not chunks:
        return ""

    parts = [
        "\n\n=== REFERENCE CASE EXCERPTS ===",
        "The following are verbatim excerpts from previously filed complaints "
        "in the Northern District of Georgia. Match this voice, structure, "
        "count format, and statutory citation style exactly. Do not invent "
        "citations or case names — only use what appears in these excerpts "
        "or standard statutory text.\n",
    ]

    # Group by source file for cleaner context
    by_file: dict = {}
    for chunk in chunks:
        fname = chunk.get("source_file", "unknown")
        by_file.setdefault(fname, []).append(chunk)

    for fname, file_chunks in by_file.items():
        dtype = file_chunks[0].get("document_type", "")
        tags = ", ".join(file_chunks[0].get("statute_tags") or [])
        header = f"\n--- {fname}"
        if dtype or tags:
            header += f" ({dtype}"
            if tags:
                header += f"; {tags}"
            header += ")"
        header += " ---"
        parts.append(header)
        # Sort by chunk_index to preserve document order
        file_chunks.sort(key=lambda c: c.get("chunk_index", 0))
        for c in file_chunks:
            parts.append(c.get("chunk_text", ""))

    return "\n".join(parts)


def build_query_text(
    plaintiff_name: str,
    case_facts: str,
    damages_description: str,
    defendants: List[str],
) -> str:
    """Compose a query string from draft inputs. Emphasizes facts and
    defendants since those drive retrieval the most."""
    parts = [f"Case against {', '.join(defendants)}" if defendants else ""]
    parts.append(case_facts or "")
    parts.append(damages_description or "")
    return "\n\n".join(p for p in parts if p).strip()
