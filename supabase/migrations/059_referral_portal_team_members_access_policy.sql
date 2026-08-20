-- Referral team memberships are accessed only by LegalFlow's authenticated backend
-- service after it validates the portal owner or active membership.

DROP POLICY IF EXISTS referral_portal_team_members_backend_only ON public.referral_portal_team_members;

CREATE POLICY referral_portal_team_members_backend_only
    ON public.referral_portal_team_members
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);
