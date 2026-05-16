"""
Knowledge Base Bulk Importer — ingests files into the case_law table,
auto-categorizes by statute, summarizes with AI, and indexes for RAG.

Designed to work with files uploaded via API or pulled from Google Drive.
"""

import io
import json
import logging
import uuid
from datetime import datetime, timezone

import anthropic

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

CATEGORIZATION_PROMPT = """You are a legal document classifier. Analyze the following document text and return JSON with:
{
  "case_name": "Full case name if it's an opinion, or descriptive title if it's a guide/article",
  "citation": "Legal citation if available (e.g., '817 F.3d 131 (4th Cir. 2016)'), or empty string",
  "court": "Court if identifiable (e.g., 'N.D. Ga.', '11th Cir.', 'S.Ct.', 'FTC', 'CFPB'), or empty string",
  "year": year as integer or null,
  "statutes": ["array of relevant statutes — use: 'FCRA', 'FDCPA', 'TCPA', 'FCRA-1681e(b)', 'FCRA-1681i', 'FCRA-1681s-2(b)', 'FDCPA-1692e', etc."],
  "category": "one of: case_opinion, statute_text, regulation, guidance, article, template, reference_guide, settlement, brief, motion",
  "holding": "Key holding or main takeaway in 1-2 sentences",
  "summary": "3-5 sentence summary of the document",
  "tags": ["5-10 search tags relevant to the content"]
}

Return ONLY the JSON. No markdown, no explanation."""


async def categorize_document(text: str, filename: str = "") -> dict:
    """Use AI to categorize and summarize a legal document."""
    client = anthropic.Anthropic()

    try:
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"Filename: {filename}\n\nDocument text (first 12000 chars):\n{text[:12000]}",
            }],
            system=CATEGORIZATION_PROMPT,
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw[raw.index("\n") + 1:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Categorization failed for {filename}: {e}")
        return {
            "case_name": filename.replace(".pdf", "").replace(".docx", "").replace(".txt", ""),
            "citation": "",
            "court": "",
            "year": None,
            "statutes": ["FCRA"],
            "category": "reference_guide",
            "holding": "",
            "summary": "",
            "tags": [],
        }


async def ingest_document(text: str, filename: str, source: str = "google_drive") -> dict:
    """Ingest a single document: categorize, save, and index."""
    supabase = get_supabase()

    # Categorize with AI
    meta = await categorize_document(text, filename)

    record_id = str(uuid.uuid4())
    record = {
        "id": record_id,
        "case_name": meta.get("case_name") or filename,
        "citation": meta.get("citation") or "",
        "court": meta.get("court") or "",
        "year": meta.get("year"),
        "statutes": meta.get("statutes") or ["FCRA"],
        "holding": meta.get("holding") or "",
        "full_text": text,
        "summary": meta.get("summary") or "",
        "tags": meta.get("tags") or [],
        "source_file": filename,
        "indexed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    supabase.table("case_law").insert(record).execute()
    logger.info(f"Ingested: {filename} → {meta.get('case_name')} [{meta.get('category')}]")

    # Index for vector search
    await index_document(record_id, text)

    return {
        "id": record_id,
        "case_name": record["case_name"],
        "category": meta.get("category", "unknown"),
        "statutes": record["statutes"],
        "tags": record["tags"],
    }


async def index_document(case_law_id: str, text: str):
    """Chunk and embed document for vector search."""
    try:
        from utils.embeddings import embed_texts, is_configured
        if not is_configured():
            logger.warning("Embeddings not configured — skipping indexing")
            return

        # Chunk: 1500 chars with 200 overlap
        chunks = []
        chunk_size = 1500
        overlap = 200
        start = 0

        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start = end - overlap

        if not chunks:
            return

        # Embed in batches of 20
        all_embeddings = []
        batch_size = 20
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            embeddings = embed_texts(batch)
            if embeddings:
                all_embeddings.extend(embeddings)

        if len(all_embeddings) != len(chunks):
            logger.error(f"Embedding count mismatch for {case_law_id}")
            return

        supabase = get_supabase()

        # Delete existing chunks
        supabase.table("case_law_chunks").delete().eq("case_law_id", case_law_id).execute()

        # Insert chunks
        records = []
        for i, (chunk, emb) in enumerate(zip(chunks, all_embeddings)):
            records.append({
                "id": str(uuid.uuid4()),
                "case_law_id": case_law_id,
                "chunk_index": i,
                "content": chunk,
                "embedding": emb,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        for i in range(0, len(records), 20):
            supabase.table("case_law_chunks").insert(records[i:i + 20]).execute()

        # Mark indexed
        supabase.table("case_law").update({"indexed": True}).eq("id", case_law_id).execute()
        logger.info(f"Indexed {case_law_id}: {len(chunks)} chunks")

    except Exception as e:
        logger.exception(f"Indexing failed for {case_law_id}: {e}")


async def bulk_ingest_texts(documents: list[dict]) -> dict:
    """Bulk ingest multiple documents.

    Args:
        documents: List of {"filename": str, "text": str}

    Returns:
        Summary of what was ingested.
    """
    results = []
    errors = []

    for doc in documents:
        filename = doc.get("filename", "unknown")
        text = doc.get("text", "")

        if not text or len(text) < 50:
            errors.append({"filename": filename, "error": "Too short or empty"})
            continue

        try:
            result = await ingest_document(text, filename)
            results.append(result)
        except Exception as e:
            errors.append({"filename": filename, "error": str(e)})
            logger.error(f"Failed to ingest {filename}: {e}")

    return {
        "ingested": len(results),
        "errors": len(errors),
        "results": results,
        "error_details": errors,
    }
