-- Keep every closing-statement revision as a durable case-specific version.
-- Also link saved attorney letterhead records to existing LegalFlow attorney profiles.

ALTER TABLE public.attorneys
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attorneys_profile_id_unique
  ON public.attorneys (profile_id)
  WHERE profile_id IS NOT NULL;

ALTER TABLE public.closing_statements
  ADD COLUMN IF NOT EXISTS version integer;

WITH ordered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY case_id
      ORDER BY created_at ASC, id ASC
    )::integer AS generated_version
  FROM public.closing_statements
)
UPDATE public.closing_statements AS statement
SET version = ordered.generated_version
FROM ordered
WHERE statement.id = ordered.id
  AND statement.version IS NULL;

ALTER TABLE public.closing_statements
  ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE public.closing_statements
  ALTER COLUMN version SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_closing_statements_case_version
  ON public.closing_statements (case_id, version);

CREATE INDEX IF NOT EXISTS idx_closing_statements_case_version_desc
  ON public.closing_statements (case_id, version DESC);

COMMENT ON COLUMN public.closing_statements.version IS
  'Sequential report version within a case. Each edited regeneration creates a new version.';
