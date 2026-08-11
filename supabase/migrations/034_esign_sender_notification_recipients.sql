-- Preserve the LegalFlow account that initiated each send so later document
-- viewed and signed alerts return to that account rather than the assigned attorney.
ALTER TABLE public.signing_sessions
    ADD COLUMN IF NOT EXISTS notification_recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notification_recipient_email TEXT;

ALTER TABLE public.signature_requests
    ADD COLUMN IF NOT EXISTS notification_recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notification_recipient_email TEXT;

CREATE INDEX IF NOT EXISTS idx_signing_sessions_notification_recipient
    ON public.signing_sessions (notification_recipient_id)
    WHERE notification_recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signature_requests_notification_recipient
    ON public.signature_requests (notification_recipient_id)
    WHERE notification_recipient_id IS NOT NULL;

COMMENT ON COLUMN public.signing_sessions.notification_recipient_email IS
    'Account email of the LegalFlow user who initiated the document send.';

COMMENT ON COLUMN public.signature_requests.notification_recipient_email IS
    'Account email of the LegalFlow user who initiated the document send.';
