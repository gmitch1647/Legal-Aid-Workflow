-- Add a constrained access level for people invited into one private referral portal.
-- Co-owners receive the same portal-management controls as the original owner,
-- but remain scoped to this one referral partner workspace.

ALTER TABLE public.referral_portal_team_members
    ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'member'
    CHECK (access_level IN ('member', 'co_owner'));

CREATE INDEX IF NOT EXISTS idx_referral_portal_team_members_partner_access
    ON public.referral_portal_team_members(referral_partner_id, status, access_level);
