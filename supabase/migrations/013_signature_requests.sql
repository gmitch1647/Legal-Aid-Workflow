-- Signature requests table for Dropbox Sign integration
CREATE TABLE IF NOT EXISTS signature_requests (
    id TEXT PRIMARY KEY,  -- Dropbox Sign signature_request_id
    title TEXT NOT NULL DEFAULT 'Document for Signature',
    document_type TEXT NOT NULL DEFAULT 'general',
    template_id TEXT,
    signer_name TEXT NOT NULL,
    signer_email TEXT NOT NULL,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_signature',
    sent_at TIMESTAMPTZ DEFAULT now(),
    signed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_sigreq_case ON signature_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_sigreq_client ON signature_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_sigreq_status ON signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_sigreq_sent_by ON signature_requests(sent_by);

-- RLS
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY sigreq_attorney_all ON signature_requests
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );

CREATE POLICY sigreq_service_all ON signature_requests
    FOR ALL
    USING (true)
    WITH CHECK (true);
