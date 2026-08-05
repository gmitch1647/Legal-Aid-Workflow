-- Attorney-controlled E-Signature email preferences.
-- Existing profile preferences are preserved while LegalFlow defaults are added.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
    ALTER COLUMN notification_preferences SET DEFAULT '{}'::jsonb;

UPDATE public.profiles
SET notification_preferences =
    '{
        "esign_document_viewed": true,
        "esign_document_signed": true,
        "esign_auto_reminders": true,
        "esign_reminder_initial_days": 2,
        "esign_reminder_interval_days": 3,
        "esign_reminder_max_count": 3
    }'::jsonb
    || CASE
        WHEN jsonb_typeof(notification_preferences) = 'object' THEN notification_preferences
        ELSE '{}'::jsonb
    END;

-- LegalFlow-managed signing sessions are the authoritative source for in-app
-- document viewing, signature completion, and reminder history.
ALTER TABLE public.signing_sessions
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS view_notification_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signed_notification_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

ALTER TABLE public.signing_sessions
    DROP CONSTRAINT IF EXISTS signing_sessions_reminder_count_nonnegative;

ALTER TABLE public.signing_sessions
    ADD CONSTRAINT signing_sessions_reminder_count_nonnegative
    CHECK (reminder_count >= 0);

-- The legacy request table continues to track external-provider requests and
-- mirrors LegalFlow sessions for unified dashboard/reporting behavior.
ALTER TABLE public.signature_requests
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS view_notification_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signed_notification_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

ALTER TABLE public.signature_requests
    DROP CONSTRAINT IF EXISTS signature_requests_reminder_count_nonnegative;

ALTER TABLE public.signature_requests
    ADD CONSTRAINT signature_requests_reminder_count_nonnegative
    CHECK (reminder_count >= 0);

-- These partial indexes keep hourly reminder scans focused on actionable rows.
CREATE INDEX IF NOT EXISTS idx_signing_sessions_pending_reminders
    ON public.signing_sessions (created_at, last_reminder_at)
    WHERE status IN ('awaiting_signature', 'viewed', 'awaiting_review');

CREATE INDEX IF NOT EXISTS idx_signature_requests_pending_reminders
    ON public.signature_requests (sent_at, last_reminder_at)
    WHERE status IN ('awaiting_signature', 'viewed', 'awaiting_review');

COMMENT ON COLUMN public.profiles.notification_preferences IS
    'Attorney-controlled email notification and E-Signature reminder preferences.';
COMMENT ON COLUMN public.signing_sessions.viewed_at IS
    'First secure signer-page view timestamp for LegalFlow-managed sessions.';
COMMENT ON COLUMN public.signing_sessions.reminder_count IS
    'Number of automated email reminders successfully delivered for this signing session.';
COMMENT ON COLUMN public.signature_requests.viewed_at IS
    'First signer-page view reported by the external provider or mirrored LegalFlow session.';
COMMENT ON COLUMN public.signature_requests.reminder_count IS
    'Number of automated email reminders successfully delivered for this signature request.';
