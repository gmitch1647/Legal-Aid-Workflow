-- Add one-time sent-notification tracking for every signing source.
ALTER TABLE public.signing_sessions
    ADD COLUMN IF NOT EXISTS sent_notification_sent_at TIMESTAMPTZ;

ALTER TABLE public.signature_requests
    ADD COLUMN IF NOT EXISTS sent_notification_sent_at TIMESTAMPTZ;

-- Preserve deliberate opt-outs while adding the new sent alert and six-hour
-- pending-document reminder policy to each attorney's preferences.
UPDATE public.profiles
SET notification_preferences =
    jsonb_build_object(
        'esign_document_sent', true,
        'esign_reminder_interval_hours', 6
    )
    || CASE
        WHEN jsonb_typeof(notification_preferences) = 'object' THEN notification_preferences
        ELSE '{}'::jsonb
    END
WHERE role IN ('attorney', 'staff_attorney');

COMMENT ON COLUMN public.signing_sessions.sent_notification_sent_at IS
    'Timestamp after the attorney sent-alert email is accepted for a LegalFlow signing session.';

COMMENT ON COLUMN public.signature_requests.sent_notification_sent_at IS
    'Timestamp after the attorney sent-alert email is accepted for an external signing-provider request.';
