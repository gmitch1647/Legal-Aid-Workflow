-- Migration 054: Store client-confirmed contact details with secure payout submissions.
-- These values are encrypted by the application before persistence. Columns remain nullable
-- so historic payout submissions are preserved without retroactive collection.

ALTER TABLE public.client_payout_information_submissions
    ADD COLUMN IF NOT EXISTS email_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS mailing_address_encrypted TEXT;

COMMENT ON COLUMN public.client_payout_information_submissions.email_encrypted IS
    'Client-confirmed email address encrypted with the payout-information cipher.';
COMMENT ON COLUMN public.client_payout_information_submissions.mailing_address_encrypted IS
    'Client-confirmed mailing address encrypted with the payout-information cipher.';
