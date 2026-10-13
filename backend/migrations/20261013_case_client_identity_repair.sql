-- Repair imported matters that were linked to an owner, staff member, or the
-- wrong client profile. A matter is relinked only when both its source email
-- and plaintiff name match exactly one existing client profile.
--
-- No client profiles are created and no source facts are overwritten. Matters
-- without a verified matching profile remain unresolved for attorney review.

WITH extracted_case_contacts AS (
  SELECT
    c.id,
    c.client_id AS current_client_id,
    LOWER(NULLIF(BTRIM(COALESCE(
      (regexp_match(COALESCE(c.case_facts, ''), '"email"[[:space:]]*:[[:space:]]*"([^"]+)"'))[1],
      (regexp_match(COALESCE(c.case_facts, ''), E'(?:^|\\n)Email:[[:space:]]*([^\\r\\n]+)'))[1]
    )), '')) AS source_email,
    LOWER(NULLIF(BTRIM(regexp_replace(
      COALESCE(c.plaintiff_name, ''),
      E'\\s+v\\.?\\s+.*$',
      '',
      'i'
    )), '')) AS plaintiff_only
  FROM public.cases AS c
),
unique_client_profiles AS (
  SELECT
    LOWER(BTRIM(email)) AS normalized_email,
    (ARRAY_AGG(id ORDER BY id))[1] AS client_id,
    (ARRAY_AGG(LOWER(BTRIM(full_name)) ORDER BY id))[1] AS normalized_name,
    COUNT(*) AS matching_profiles
  FROM public.profiles
  WHERE role = 'client'
    AND NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(full_name, '')), '') IS NOT NULL
  GROUP BY LOWER(BTRIM(email))
)
UPDATE public.cases AS c
SET client_id = candidate.client_id,
    updated_at = NOW()
FROM extracted_case_contacts AS source
JOIN unique_client_profiles AS candidate
  ON candidate.normalized_email = source.source_email
 AND candidate.matching_profiles = 1
JOIN public.profiles AS current_profile
  ON current_profile.id = source.current_client_id
WHERE c.id = source.id
  AND source.source_email LIKE '%@%'
  AND source.plaintiff_only IS NOT NULL
  AND candidate.normalized_name = source.plaintiff_only
  AND (
    current_profile.role <> 'client'
    OR current_profile.id <> candidate.client_id
  );
