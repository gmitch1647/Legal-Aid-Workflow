-- Audited outbound email and SMS messages sent to referral partners.
-- Kept separate from client communications because a referral partner is not a client.
CREATE TABLE IF NOT EXISTS referral_partner_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_partner_id UUID NOT NULL REFERENCES referral_partners(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    recipient TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    error_message TEXT,
    sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    provider_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_partner_messages_partner_created
    ON referral_partner_messages(referral_partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_partner_messages_sent_by
    ON referral_partner_messages(sent_by, created_at DESC);

ALTER TABLE referral_partner_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY referral_partner_messages_attorney_all
    ON referral_partner_messages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('attorney', 'staff_attorney')
        )
    );
