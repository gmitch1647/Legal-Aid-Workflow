-- 026_closing_statements.sql
-- Settlement closing-statement generation and signing records.

-- A human-friendly matter number is optional so existing cases remain compatible.
ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS case_number text;

-- Permit clear filing labels for uploaded settlements and generated closing statements.
ALTER TABLE public.case_documents
    DROP CONSTRAINT IF EXISTS case_documents_document_category_check;

ALTER TABLE public.case_documents
    ADD CONSTRAINT case_documents_document_category_check
    CHECK (document_category IN (
        'credit_report',
        'dispute_letter',
        'bureau_response',
        'collection_notice',
        'call_log',
        'settlement',
        'closing_statement',
        'signed_closing_statement',
        'other'
    ));

CREATE TABLE IF NOT EXISTS public.closing_statements (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                    uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    client_id                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    settlement_document_id     uuid REFERENCES public.case_documents(id) ON DELETE SET NULL,
    settlement_storage_path    text,
    draft_storage_path         text NOT NULL,
    signed_storage_path        text,
    statement_file_name        text NOT NULL,
    case_number                text NOT NULL,
    adverse_party              text,
    account_reference          text,
    gross_settlement_cents     bigint NOT NULL CHECK (gross_settlement_cents >= 0),
    client_payout_cents        bigint NOT NULL CHECK (client_payout_cents >= 0),
    paralegal_fee_cents        bigint NOT NULL DEFAULT 0 CHECK (paralegal_fee_cents >= 0),
    attorney_fee_cents         bigint NOT NULL DEFAULT 0 CHECK (attorney_fee_cents >= 0),
    non_monetary_terms         text,
    signer_name                text NOT NULL,
    signer_email               text NOT NULL,
    signature_session_id       text REFERENCES public.signing_sessions(id) ON DELETE SET NULL,
    status                     text NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'awaiting_signature', 'signed', 'void')),
    created_by                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closing_statements_case_id
    ON public.closing_statements(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_closing_statements_client_id
    ON public.closing_statements(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_closing_statements_created_by
    ON public.closing_statements(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_closing_statements_signature_session
    ON public.closing_statements(signature_session_id)
    WHERE signature_session_id IS NOT NULL;

ALTER TABLE public.closing_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attorneys manage their closing statements" ON public.closing_statements;
CREATE POLICY "Attorneys manage their closing statements"
ON public.closing_statements
FOR ALL
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP TRIGGER IF EXISTS trg_closing_statements_updated_at ON public.closing_statements;
CREATE TRIGGER trg_closing_statements_updated_at
    BEFORE UPDATE ON public.closing_statements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.closing_statements IS
    'Attorney-generated settlement closing statements with private calculation and signing metadata.';
COMMENT ON COLUMN public.closing_statements.gross_settlement_cents IS
    'Gross settlement amount in cents. All monetary calculation uses integer cents.';
COMMENT ON COLUMN public.closing_statements.client_payout_cents IS
    'Client payout entered and confirmed by the attorney in cents.';
COMMENT ON COLUMN public.closing_statements.attorney_fee_cents IS
    'Automatically calculated remainder after client payout and optional paralegal fee.';
