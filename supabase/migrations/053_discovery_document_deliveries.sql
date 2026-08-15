-- Migration 053: Auditable in-app delivery of case discovery documents to assigned attorneys.
-- The delivery rows contain only metadata and selected document identifiers; the files remain in protected storage.

CREATE TABLE IF NOT EXISTS public.discovery_document_deliveries (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    recipient_email TEXT NOT NULL,
    sent_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
    sent_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.discovery_document_delivery_items (
    id UUID PRIMARY KEY,
    delivery_id UUID NOT NULL REFERENCES public.discovery_document_deliveries(id) ON DELETE CASCADE,
    case_document_id UUID NOT NULL REFERENCES public.case_documents(id) ON DELETE RESTRICT,
    file_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (delivery_id, case_document_id)
);

CREATE INDEX IF NOT EXISTS discovery_document_deliveries_case_idx
    ON public.discovery_document_deliveries(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS discovery_document_deliveries_recipient_idx
    ON public.discovery_document_deliveries(recipient_profile_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS discovery_document_delivery_items_delivery_idx
    ON public.discovery_document_delivery_items(delivery_id);

COMMENT ON TABLE public.discovery_document_deliveries IS
    'Audit log for user-confirmed discovery-document emails sent from LegalFlow to a case assigned attorney.';
COMMENT ON TABLE public.discovery_document_delivery_items IS
    'Selected case documents attached to one discovery-document delivery email.';
