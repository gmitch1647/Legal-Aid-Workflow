-- Secure prefill support for Form W-9 requests.
-- The raw taxpayer identification number is never stored in this table; it is
-- Fernet-encrypted by the backend before persistence. Public signing endpoints
-- receive only a lock indicator, number type, and masked suffix.

ALTER TABLE w9_requests
    ADD COLUMN IF NOT EXISTS prefilled_legal_name TEXT,
    ADD COLUMN IF NOT EXISTS prefilled_tin_ciphertext TEXT,
    ADD COLUMN IF NOT EXISTS prefilled_tin_type TEXT
        CHECK (prefilled_tin_type IN ('ssn', 'ein')),
    ADD COLUMN IF NOT EXISTS prefilled_tin_last4 TEXT
        CHECK (prefilled_tin_last4 IS NULL OR char_length(prefilled_tin_last4) = 4),
    ADD COLUMN IF NOT EXISTS prefill_sources JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN w9_requests.prefilled_legal_name IS
    'Attorney-confirmed or case-file-derived legal name, locked on the public signer form.';
COMMENT ON COLUMN w9_requests.prefilled_tin_ciphertext IS
    'Application-encrypted SSN or EIN used only to render the completed W-9; never returned by public APIs.';
COMMENT ON COLUMN w9_requests.prefilled_tin_last4 IS
    'Masked-display suffix for an attorney-only record; no raw taxpayer ID.';
COMMENT ON COLUMN w9_requests.prefill_sources IS
    'Non-sensitive provenance such as client profile, manual attorney entry, or source filename.';
