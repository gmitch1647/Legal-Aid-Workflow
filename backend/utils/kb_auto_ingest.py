"""
Auto-ingest knowledge base files into the case_law table on startup.
Checks which files are already indexed and only adds new ones.
"""

import logging
from pathlib import Path

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


async def auto_ingest_knowledge_base():
    """Check for knowledge base files not yet in the database and ingest them."""
    from utils.knowledge_importer import ingest_document

    # Find knowledge base root
    possible_roots = [
        Path(__file__).resolve().parent.parent / "knowledge_base",
        Path.cwd() / "knowledge_base",
        Path.cwd() / "backend" / "knowledge_base",
        Path("/app") / "knowledge_base",
    ]

    kb_root = None
    for p in possible_roots:
        if p.exists() and any(p.rglob("*.md")):
            kb_root = p
            break

    if not kb_root:
        logger.info("No knowledge base directory found — skipping auto-ingest")
        return

    supabase = get_supabase()

    # Get already-indexed source files
    resp = supabase.table("case_law").select("source_file").execute()
    indexed_files = set(r.get("source_file", "") for r in (resp.data or []))

    # Find all .md files not yet indexed
    new_files = []
    for md_file in sorted(kb_root.rglob("*.md")):
        if md_file.name not in indexed_files and md_file.stat().st_size > 100:
            new_files.append(md_file)

    if not new_files:
        logger.info(f"Knowledge base: all {len(indexed_files)} files already indexed")
        return

    logger.info(f"Knowledge base: {len(new_files)} new files to ingest")

    ingested = 0
    for md_file in new_files:
        try:
            text = md_file.read_text(encoding="utf-8")
            if text and len(text) > 50:
                await ingest_document(text, md_file.name, source="knowledge_base")
                ingested += 1
        except Exception as e:
            logger.warning(f"Failed to ingest {md_file.name}: {e}")

    logger.info(f"Knowledge base auto-ingest complete: {ingested}/{len(new_files)} files")
