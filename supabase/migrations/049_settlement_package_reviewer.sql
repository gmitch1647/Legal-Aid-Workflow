-- Migration 049: Explicit owner reviewer for settlement package workflow

CREATE TABLE IF NOT EXISTS public.settlement_package_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_package_one_active_reviewer
  ON public.settlement_package_reviewers ((active))
  WHERE active = true;

ALTER TABLE public.settlement_package_reviewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlement_package_reviewers_attorney_read ON public.settlement_package_reviewers
  FOR SELECT USING (public.is_attorney());

INSERT INTO public.settlement_package_reviewers (owner_profile_id, active)
SELECT id, true
FROM public.profiles
WHERE lower(email) = lower('gmitch1647@gmail.com')
LIMIT 1
ON CONFLICT (owner_profile_id) DO UPDATE SET active = true, updated_at = now();
