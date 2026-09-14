-- Preserve the actual plaintiff/client display name for fast Case Pipeline cards.
-- This prevents owner-created draft matters from being labeled with the attorney
-- profile when an intake client profile was not selected at draft creation.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS plaintiff_name text;

-- For all ordinary existing matters, use the linked client profile as a fallback.
UPDATE public.cases AS c
SET plaintiff_name = NULLIF(BTRIM(p.full_name), '')
FROM public.profiles AS p
WHERE p.id = c.client_id
  AND NULLIF(BTRIM(COALESCE(c.plaintiff_name, '')), '') IS NULL
  AND NULLIF(BTRIM(COALESCE(p.full_name, '')), '') IS NOT NULL;

-- Draft-created cases contain an explicit plaintiff header. It is more accurate
-- than the owner fallback and therefore overwrites the display-name fallback.
WITH extracted_names AS (
  SELECT
    c.id,
    NULLIF(BTRIM((regexp_match(c.case_facts, E'=== PLAINTIFF ===\\nName:[[:space:]]*([^\\r\\n]+)'))[1]), '') AS extracted_name
  FROM public.cases AS c
  WHERE c.case_facts ~ E'=== PLAINTIFF ===\\nName:[[:space:]]*[^\\r\\n]+'
)
UPDATE public.cases AS c
SET plaintiff_name = e.extracted_name
FROM extracted_names AS e
WHERE c.id = e.id
  AND e.extracted_name IS NOT NULL;

-- Where a draft was incorrectly linked to an owner/attorney fallback, repair the
-- ownership only if exactly one existing client profile matches the plaintiff name.
WITH extracted_names AS (
  SELECT
    c.id,
    NULLIF(BTRIM((regexp_match(c.case_facts, E'=== PLAINTIFF ===\\nName:[[:space:]]*([^\\r\\n]+)'))[1]), '') AS extracted_name
  FROM public.cases AS c
  WHERE c.case_facts ~ E'=== PLAINTIFF ===\\nName:[[:space:]]*[^\\r\\n]+'
),
unique_client_profiles AS (
  SELECT
    LOWER(BTRIM(full_name)) AS normalized_name,
    (ARRAY_AGG(id ORDER BY id))[1] AS client_id,
    COUNT(*) AS matching_profiles
  FROM public.profiles
  WHERE role = 'client'
    AND NULLIF(BTRIM(COALESCE(full_name, '')), '') IS NOT NULL
  GROUP BY LOWER(BTRIM(full_name))
)
UPDATE public.cases AS c
SET client_id = candidate.client_id
FROM extracted_names AS e
JOIN unique_client_profiles AS candidate
  ON candidate.normalized_name = LOWER(e.extracted_name)
WHERE c.id = e.id
  AND e.extracted_name IS NOT NULL
  AND candidate.matching_profiles = 1
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS current_owner
    WHERE current_owner.id = c.client_id
      AND current_owner.role <> 'client'
  );

CREATE INDEX IF NOT EXISTS idx_cases_plaintiff_name
  ON public.cases (plaintiff_name);
