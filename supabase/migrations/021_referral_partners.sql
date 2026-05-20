-- Referral partners table — tracks people/firms who refer cases to you
CREATE TABLE IF NOT EXISTS referral_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    referral_fee_type TEXT DEFAULT 'percentage',  -- percentage, flat, none
    referral_fee_amount NUMERIC DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add referral_partner_id to profiles (clients) and cases
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_partner_id UUID REFERENCES referral_partners(id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS referral_partner_id UUID REFERENCES referral_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rp_created_by ON referral_partners(created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_referral ON profiles(referral_partner_id);
CREATE INDEX IF NOT EXISTS idx_cases_referral ON cases(referral_partner_id);

ALTER TABLE referral_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY rp_attorney_all ON referral_partners
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('attorney', 'staff_attorney'))
    );
