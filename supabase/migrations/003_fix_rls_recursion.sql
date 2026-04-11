-- ============================================================================
-- Migration 003: Fix infinite recursion in RLS policies
--
-- The original policies check profiles.role by querying profiles itself,
-- which re-triggers the same policy infinitely. This migration replaces
-- all those checks with a SECURITY DEFINER helper function that bypasses
-- RLS when looking up the current user's role.
-- ============================================================================

-- Helper function: returns true if the current auth user is an attorney.
-- SECURITY DEFINER makes it run with owner privileges, bypassing RLS.
CREATE OR REPLACE FUNCTION public.is_attorney()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'attorney'
    );
$$;

-- Drop and recreate all policies that caused recursion
-- -----------------------------------------------------------------------------

-- profiles
DROP POLICY IF EXISTS profiles_select_attorney ON profiles;
CREATE POLICY profiles_select_attorney ON profiles
    FOR SELECT USING (public.is_attorney());

-- cases
DROP POLICY IF EXISTS cases_select_attorney ON cases;
CREATE POLICY cases_select_attorney ON cases
    FOR SELECT USING (public.is_attorney());

DROP POLICY IF EXISTS cases_update_attorney ON cases;
CREATE POLICY cases_update_attorney ON cases
    FOR UPDATE USING (public.is_attorney());

DROP POLICY IF EXISTS cases_delete_attorney ON cases;
CREATE POLICY cases_delete_attorney ON cases
    FOR DELETE USING (public.is_attorney());

-- defendants
DROP POLICY IF EXISTS defendants_insert_attorney ON defendants;
CREATE POLICY defendants_insert_attorney ON defendants
    FOR INSERT WITH CHECK (public.is_attorney());

DROP POLICY IF EXISTS defendants_update_attorney ON defendants;
CREATE POLICY defendants_update_attorney ON defendants
    FOR UPDATE USING (public.is_attorney());

-- case_defendants
DROP POLICY IF EXISTS case_defendants_all_attorney ON case_defendants;
CREATE POLICY case_defendants_all_attorney ON case_defendants
    FOR ALL USING (public.is_attorney());

-- case_documents
DROP POLICY IF EXISTS case_documents_select_attorney ON case_documents;
CREATE POLICY case_documents_select_attorney ON case_documents
    FOR SELECT USING (public.is_attorney());

DROP POLICY IF EXISTS case_documents_insert_attorney ON case_documents;
CREATE POLICY case_documents_insert_attorney ON case_documents
    FOR INSERT WITH CHECK (public.is_attorney());

-- agent_outputs — attorneys only
DROP POLICY IF EXISTS agent_outputs_select_attorney ON agent_outputs;
CREATE POLICY agent_outputs_select_attorney ON agent_outputs
    FOR SELECT USING (public.is_attorney());

DROP POLICY IF EXISTS agent_outputs_all_attorney ON agent_outputs;
CREATE POLICY agent_outputs_all_attorney ON agent_outputs
    FOR ALL USING (public.is_attorney());

-- complaints
DROP POLICY IF EXISTS complaints_select_attorney ON complaints;
CREATE POLICY complaints_select_attorney ON complaints
    FOR SELECT USING (public.is_attorney());

DROP POLICY IF EXISTS complaints_all_attorney ON complaints;
CREATE POLICY complaints_all_attorney ON complaints
    FOR ALL USING (public.is_attorney());

-- messages — attorneys can see all; clients see their own (no change needed if client policy doesn't recurse)
DROP POLICY IF EXISTS messages_select_attorney ON messages;
CREATE POLICY messages_select_attorney ON messages
    FOR SELECT USING (public.is_attorney());

DROP POLICY IF EXISTS messages_insert_attorney ON messages;
CREATE POLICY messages_insert_attorney ON messages
    FOR INSERT WITH CHECK (public.is_attorney());

-- Grant execute on the helper function to the auth roles
GRANT EXECUTE ON FUNCTION public.is_attorney() TO anon, authenticated;
