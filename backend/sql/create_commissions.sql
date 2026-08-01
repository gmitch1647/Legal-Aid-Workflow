-- Commission tracking for referral partners (CROs)
-- Run in Supabase SQL Editor

-- Add settlement_amount to cases if not exists
DO $$ BEGIN
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_partner_id UUID NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    description TEXT,
    settlement_amount NUMERIC NOT NULL DEFAULT 0,
    fee_type TEXT NOT NULL DEFAULT 'percentage',
    fee_value NUMERIC NOT NULL DEFAULT 0,
    commission_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    quickbooks_vendor_id TEXT,
    quickbooks_bill_id TEXT,
    quickbooks_payment_id TEXT,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commissions_partner ON commissions(referral_partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_case ON commissions(case_id);

-- QuickBooks connection settings
CREATE TABLE IF NOT EXISTS quickbooks_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    realm_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    company_name TEXT,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
