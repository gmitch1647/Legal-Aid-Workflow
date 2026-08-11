-- Record when LegalFlow has successfully sent the client a PDF copy of the
-- completed signed agreement. The timestamp prevents duplicate delivery.
ALTER TABLE public.signing_sessions
    ADD COLUMN IF NOT EXISTS client_copy_sent_at TIMESTAMPTZ;

ALTER TABLE public.signature_requests
    ADD COLUMN IF NOT EXISTS client_copy_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.signing_sessions.client_copy_sent_at IS
    'Timestamp after LegalFlow accepts delivery of the signer signed-PDF copy.';

COMMENT ON COLUMN public.signature_requests.client_copy_sent_at IS
    'Timestamp after LegalFlow accepts delivery of the signer signed-PDF copy.';
