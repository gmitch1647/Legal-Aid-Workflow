-- Owner-managed feature visibility for referral-attorney workspaces.
-- Values are stored per referral partner so the portal user stays linked to the
-- existing private pipeline and referral-case access boundary.
ALTER TABLE referral_partners
    ADD COLUMN IF NOT EXISTS feature_access JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN referral_partners.feature_access IS
    'Owner-managed LegalFlow feature flags for a referral attorney portal user.';
