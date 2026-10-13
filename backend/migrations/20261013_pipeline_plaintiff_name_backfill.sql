-- Restore legacy pipeline labels from the preserved intake plaintiff header.
-- The LIMIT makes this bounded and idempotent; only empty labels are filled.
WITH candidates AS (
    SELECT
        c.id,
        NULLIF(
            BTRIM((regexp_match(
                COALESCE(c.case_facts, ''),
                E'=== PLAINTIFF ===\\nName:[[:space:]]*([^\\r\\n]+)'
            ))[1]),
            ''
        ) AS plaintiff_name
    FROM public.cases AS c
    WHERE NULLIF(BTRIM(COALESCE(c.plaintiff_name, '')), '') IS NULL
    ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
    LIMIT 100
)
UPDATE public.cases AS c
SET
    plaintiff_name = candidates.plaintiff_name,
    updated_at = NOW()
FROM candidates
WHERE c.id = candidates.id
  AND candidates.plaintiff_name IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(c.plaintiff_name, '')), '') IS NULL;
