-- Attorneys table — stores attorney info for complaint signature blocks
CREATE TABLE IF NOT EXISTS attorneys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    bar_number TEXT,
    firm_name TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    is_default BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE attorneys ENABLE ROW LEVEL SECURITY;

CREATE POLICY attorneys_attorney_all ON attorneys
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );
