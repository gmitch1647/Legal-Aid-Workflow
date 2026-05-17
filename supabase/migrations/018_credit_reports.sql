-- Credit reports table — stores pulled reports from Experian API
CREATE TABLE IF NOT EXISTS credit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    bureau TEXT NOT NULL DEFAULT 'experian',
    pulled_at TIMESTAMPTZ DEFAULT now(),
    report_data JSONB,
    accounts JSONB DEFAULT '[]'::jsonb,
    scores JSONB DEFAULT '{}'::jsonb,
    pulled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_client ON credit_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_cr_bureau ON credit_reports(bureau);
CREATE INDEX IF NOT EXISTS idx_cr_pulled_at ON credit_reports(pulled_at);

ALTER TABLE credit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_attorney_all ON credit_reports
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );
