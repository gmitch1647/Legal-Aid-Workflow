-- ============================================================================
-- Migration 007: Communications table for email and SMS tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS communications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    case_id         uuid REFERENCES cases(id) ON DELETE SET NULL,
    channel         text NOT NULL CHECK (channel IN ('email', 'sms')),
    direction       text NOT NULL CHECK (direction IN ('outbound', 'inbound')) DEFAULT 'outbound',
    recipient       text NOT NULL,      -- email address or phone number
    subject         text,               -- email subject (null for SMS)
    body            text NOT NULL,
    status          text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'pending')),
    error_message   text,
    sent_by         uuid REFERENCES profiles(id),
    metadata        jsonb,              -- provider response data
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_communications_client_id ON communications (client_id);
CREATE INDEX idx_communications_case_id ON communications (case_id);
CREATE INDEX idx_communications_channel ON communications (channel);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY communications_select_attorney ON communications
    FOR SELECT USING (public.is_attorney());

CREATE POLICY communications_insert_attorney ON communications
    FOR INSERT WITH CHECK (public.is_attorney());
