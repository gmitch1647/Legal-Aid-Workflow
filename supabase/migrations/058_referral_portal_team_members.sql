-- Referral-portal team memberships.
-- An invited team account is an affiliate user linked to exactly one active
-- referral attorney workspace. Access is enforced server-side by matching the
-- partner ID to every case, document, message, and pipeline request.

CREATE TABLE IF NOT EXISTS public.referral_portal_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (referral_partner_id, profile_id)
);

-- The existing portal design has one selected workspace per affiliate session.
-- Prevent a team account from silently gaining access to multiple firms.
CREATE UNIQUE INDEX IF NOT EXISTS referral_portal_team_members_one_active_workspace
    ON public.referral_portal_team_members(profile_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_referral_portal_team_members_partner_status
    ON public.referral_portal_team_members(referral_partner_id, status, created_at DESC);

ALTER TABLE public.referral_portal_team_members ENABLE ROW LEVEL SECURITY;

-- Browser clients never access this table directly. The authenticated backend
-- service validates the caller and scopes every operation to the owning partner.
COMMENT ON TABLE public.referral_portal_team_members IS
    'Invited staff accounts for one private referral-attorney portal workspace.';
