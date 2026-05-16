-- Dispute sessions table — stores credit report dispute work
CREATE TABLE IF NOT EXISTS dispute_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT NOT NULL,
    client_dob TEXT,
    client_address TEXT,
    client_city_state_zip TEXT,
    client_ssn_last4 TEXT,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
    letters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',  -- draft, letters_generated, sent
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_sess_created_by ON dispute_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_dispute_sess_client_id ON dispute_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_dispute_sess_status ON dispute_sessions(status);

-- RLS
ALTER TABLE dispute_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dispute_sess_attorney_all ON dispute_sessions
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );
