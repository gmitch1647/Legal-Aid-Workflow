-- ============================================================================
-- Migration 056: Referral Attorney Workspaces
--
-- Adds the durable ownership and routing fields needed for a restricted
-- referral-attorney portal. Each referral partner may have one portal user,
-- one dedicated pipeline, one assigned working attorney, and one public
-- submission slug. Client and case rows keep the existing referral_partner_id
-- relationship so the partner's access remains case-specific.
-- ============================================================================

ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS assigned_attorney_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submission_slug text,
  ADD COLUMN IF NOT EXISTS portal_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS referral_partners_submission_slug_unique
  ON public.referral_partners (submission_slug)
  WHERE submission_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_partners_portal_user_id
  ON public.referral_partners (portal_user_id)
  WHERE portal_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_partners_assigned_attorney_id
  ON public.referral_partners (assigned_attorney_id)
  WHERE assigned_attorney_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_partners_pipeline_id
  ON public.referral_partners (pipeline_id)
  WHERE pipeline_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_referral_partner_pipeline
  ON public.cases (referral_partner_id, pipeline_id, created_at DESC)
  WHERE referral_partner_id IS NOT NULL;

COMMENT ON COLUMN public.referral_partners.assigned_attorney_id IS
  'The LegalFlow attorney who works this partner’s referral cases.';
COMMENT ON COLUMN public.referral_partners.pipeline_id IS
  'The private referral pipeline used only for this partner’s submitted cases.';
COMMENT ON COLUMN public.referral_partners.submission_slug IS
  'Non-secret public Case Referral Hub path segment for partner-attributed submissions.';
