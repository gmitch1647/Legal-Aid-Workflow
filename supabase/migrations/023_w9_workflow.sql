-- Secure W-9 collection workflow.
-- Taxpayer identification numbers are stored only as application-encrypted ciphertext.

CREATE TABLE IF NOT EXISTS w9_requests (
    id UUID PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT 'Form W-9 — Taxpayer Information and Certification',
    signer_name TEXT NOT NULL,
    signer_email TEXT NOT NULL,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    attorney_name TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting_submission'
        CHECK (status IN ('awaiting_submission', 'complete', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_w9_requests_status ON w9_requests(status);
CREATE INDEX IF NOT EXISTS idx_w9_requests_case ON w9_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_w9_requests_client ON w9_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_w9_requests_sent_by ON w9_requests(sent_by);

CREATE TABLE IF NOT EXISTS w9_submissions (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL UNIQUE REFERENCES w9_requests(id) ON DELETE CASCADE,
    legal_name TEXT NOT NULL,
    business_name TEXT,
    tax_classification TEXT NOT NULL,
    llc_tax_classification TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    tin_type TEXT NOT NULL CHECK (tin_type IN ('ssn', 'ein')),
    tin_ciphertext TEXT NOT NULL,
    tin_last4 TEXT NOT NULL CHECK (char_length(tin_last4) = 4),
    completed_pdf_path TEXT NOT NULL,
    audit_trail JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_w9_submissions_request ON w9_submissions(request_id);

ALTER TABLE w9_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE w9_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS w9_requests_attorney_access ON w9_requests;
CREATE POLICY w9_requests_attorney_access ON w9_requests
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    );

DROP POLICY IF EXISTS w9_submissions_attorney_access ON w9_submissions;
CREATE POLICY w9_submissions_attorney_access ON w9_submissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    );

-- The service role used only by the backend bypasses RLS; no client-facing
-- policy is added for the private W-9 bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('w9-documents', 'w9-documents', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['application/pdf'];
