-- RPC function for semantic search on case law chunks
CREATE OR REPLACE FUNCTION match_case_law_chunks(
    query_embedding vector(1024),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    case_law_id uuid,
    content text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        clc.id,
        clc.case_law_id,
        clc.content,
        1 - (clc.embedding <=> query_embedding) AS similarity
    FROM case_law_chunks clc
    WHERE 1 - (clc.embedding <=> query_embedding) > match_threshold
    ORDER BY clc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
