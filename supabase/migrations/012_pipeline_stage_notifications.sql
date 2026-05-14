-- ============================================================================
-- Migration 012: Add notification settings to pipeline stages
-- ============================================================================

ALTER TABLE pipeline_stages
    ADD COLUMN IF NOT EXISTS notify_on_enter boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS notify_email boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS notify_sms boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS notification_template text DEFAULT '';
