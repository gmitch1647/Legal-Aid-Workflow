-- ============================================================================
-- Migration 004: RAG — pgvector + reference_chunks table
--
-- Enables semantic search over reference case documents. The
-- reference_indexer utility chunks each .docx file in
-- backend/reference_cases/, embeds each chunk via Voyage AI, and
-- stores the vector here. The complaint_drafter agent queries this
-- table at runtime to retrieve only the most relevant ~8 chunks for
-- the user's case facts, instead of loading whole files every time.
--
-- Embedding dimension: 1024 (matches voyage-3 / voyage-law-2 models)
-- ============================================================================

-- Enable the pgvector extension (free, built into Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- Reference chunks table
CREATE TABLE IF NOT EXISTS reference_chunks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file     text NOT NULL,
    chunk_index     integer NOT NULL,
    chunk_text      text NOT NULL,
    word_count      integer NOT NULL,
    document_type   text,              -- 'complaint' | 'motion' | 'discovery' | 'response' | 'guide'
    statute_tags    text[],            -- ['FCRA', 'FDCPA', 'TCPA', 'GA_FBPA', 'willful']
    defendants      text[],            -- ['Equifax', 'Midland', ...] extracted from file/chunk
    embedding       vector(1024),      -- voyage-3 / voyage-law-2 produces 1024-dim
    metadata        jsonb,
    file_hash       text NOT NULL,     -- SHA256 of source file content, for change detection
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast vector similarity search (cosine distance)
-- IVFFlat is a good default; switch to HNSW later if the library grows past ~10k chunks
CREATE INDEX IF NOT EXISTS idx_reference_chunks_embedding
    ON reference_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Metadata indexes for filtering
CREATE INDEX IF NOT EXISTS idx_reference_chunks_document_type
    ON reference_chunks (document_type);
CREATE INDEX IF NOT EXISTS idx_reference_chunks_source_file
    ON reference_chunks (source_file);
CREATE INDEX IF NOT EXISTS idx_reference_chunks_statute_tags
    ON reference_chunks USING gin (statute_tags);
CREATE INDEX IF NOT EXISTS idx_reference_chunks_defendants
    ON reference_chunks USING gin (defendants);

-- Unique constraint: one chunk per source file + chunk index
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_chunks_unique
    ON reference_chunks (source_file, chunk_index);

-- RLS: reference library is read-only for authenticated users; only
-- service role (backend) can insert/update/delete.
ALTER TABLE reference_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY reference_chunks_select_all ON reference_chunks
    FOR SELECT USING (true);

-- Service role bypasses RLS, so no explicit write policy needed.

-- ============================================================================
-- Retrieval function — call this from Python via RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION match_reference_chunks(
    query_embedding vector(1024),
    match_count int DEFAULT 8,
    filter_document_type text DEFAULT NULL,
    filter_statute_tag text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    source_file text,
    chunk_index integer,
    chunk_text text,
    document_type text,
    statute_tags text[],
    defendants text[],
    similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rc.id,
        rc.source_file,
        rc.chunk_index,
        rc.chunk_text,
        rc.document_type,
        rc.statute_tags,
        rc.defendants,
        1 - (rc.embedding <=> query_embedding) AS similarity
    FROM reference_chunks rc
    WHERE
        (filter_document_type IS NULL OR rc.document_type = filter_document_type)
        AND (filter_statute_tag IS NULL OR filter_statute_tag = ANY(rc.statute_tags))
    ORDER BY rc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_reference_chunks TO anon, authenticated;
