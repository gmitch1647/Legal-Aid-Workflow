-- Audit each confirmed delivery of a completed settlement package to a selected
-- LegalFlow attorney. The W-9 itself remains in protected storage; this table
-- records only identifiers and delivery status.
CREATE TABLE IF NOT EXISTS public.settlement_document_deliveries (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    settlement_session_id TEXT NOT NULL REFERENCES public.signing_sessions(id) ON DELETE RESTRICT,
    w9_request_id UUID NOT NULL REFERENCES public.w9_requests(id) ON DELETE RESTRICT,
    recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    recipient_email TEXT NOT NULL,
    sent_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS settlement_document_deliveries_case_idx
    ON public.settlement_document_deliveries(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS settlement_document_deliveries_recipient_idx
    ON public.settlement_document_deliveries(recipient_profile_id, sent_at DESC);

COMMENT ON TABLE public.settlement_document_deliveries IS
    'Audit log for confirmed selected-attorney settlement delivery emails. Completed W-9 files are never stored or emailed through this table.';
