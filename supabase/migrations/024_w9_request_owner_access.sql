-- Harden Form W-9 ownership boundaries.
-- The backend uses a Supabase service-role client and therefore also applies
-- sent_by filters at the API layer. These policies protect direct authenticated
-- database access and ensure one attorney cannot browse another attorney's W-9s.

DROP POLICY IF EXISTS w9_requests_attorney_access ON w9_requests;
DROP POLICY IF EXISTS w9_requests_owner_access ON w9_requests;

CREATE POLICY w9_requests_owner_access ON w9_requests
    FOR ALL TO authenticated
    USING (
        sent_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    )
    WITH CHECK (
        sent_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    );

DROP POLICY IF EXISTS w9_submissions_attorney_access ON w9_submissions;
DROP POLICY IF EXISTS w9_submissions_owner_access ON w9_submissions;

CREATE POLICY w9_submissions_owner_access ON w9_submissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM w9_requests
            WHERE w9_requests.id = w9_submissions.request_id
              AND w9_requests.sent_by = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM w9_requests
            WHERE w9_requests.id = w9_submissions.request_id
              AND w9_requests.sent_by = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    );
