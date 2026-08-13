-- Extend audited referral-partner messages into a two-way conversation history.
-- No client communication records are reused for referral partner conversations.
ALTER TABLE referral_partner_messages
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound',
    ADD COLUMN IF NOT EXISTS sender TEXT,
    ADD COLUMN IF NOT EXISTS thread_key TEXT,
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
    ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

ALTER TABLE referral_partner_messages
    DROP CONSTRAINT IF EXISTS referral_partner_messages_direction_check;
ALTER TABLE referral_partner_messages
    ADD CONSTRAINT referral_partner_messages_direction_check
    CHECK (direction IN ('outbound', 'inbound'));

ALTER TABLE referral_partner_messages
    DROP CONSTRAINT IF EXISTS referral_partner_messages_status_check;
ALTER TABLE referral_partner_messages
    ADD CONSTRAINT referral_partner_messages_status_check
    CHECK (status IN ('sent', 'failed', 'received', 'ignored'));

UPDATE referral_partner_messages
SET direction = 'outbound'
WHERE direction IS NULL;

CREATE INDEX IF NOT EXISTS idx_referral_partner_messages_partner_thread_created
    ON referral_partner_messages(referral_partner_id, thread_key, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_partner_messages_provider_event_unique
    ON referral_partner_messages(provider_event_id)
    WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_partner_messages_provider_message
    ON referral_partner_messages(provider_message_id)
    WHERE provider_message_id IS NOT NULL;
