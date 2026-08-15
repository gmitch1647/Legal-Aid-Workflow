-- Migration 055: Client-separated, case-scoped document exchange.
-- Each exchange is tied to exactly one client and case. Every returned draft is a
-- new package version, preserving the prior package, selected documents, notes,
-- delivery state, and review history.

CREATE TABLE IF NOT EXISTS public.case_document_exchange_threads (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_attorney_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'other'
        CHECK (document_type IN ('interrogatories', 'requests_for_production', 'requests_for_admission', 'discovery_response', 'declaration', 'settlement_draft', 'court_filing', 'other')),
    status TEXT NOT NULL DEFAULT 'awaiting_attorney'
        CHECK (status IN ('awaiting_owner', 'awaiting_attorney', 'finalized', 'archived')),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.case_document_exchange_packages (
    id UUID PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES public.case_document_exchange_threads(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    stage TEXT NOT NULL DEFAULT 'working_copy'
        CHECK (stage IN ('attorney_draft', 'owner_working_copy', 'returned_for_review', 'final_attorney_version', 'filed_served')),
    message TEXT,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (thread_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.case_document_exchange_items (
    id UUID PRIMARY KEY,
    package_id UUID NOT NULL REFERENCES public.case_document_exchange_packages(id) ON DELETE CASCADE,
    case_document_id UUID NOT NULL REFERENCES public.case_documents(id) ON DELETE RESTRICT,
    file_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (package_id, case_document_id)
);

CREATE TABLE IF NOT EXISTS public.case_document_exchange_comments (
    id UUID PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES public.case_document_exchange_threads(id) ON DELETE CASCADE,
    package_id UUID REFERENCES public.case_document_exchange_packages(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS case_document_exchange_threads_case_idx
    ON public.case_document_exchange_threads(case_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS case_document_exchange_threads_client_idx
    ON public.case_document_exchange_threads(client_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS case_document_exchange_packages_thread_idx
    ON public.case_document_exchange_packages(thread_id, version_number ASC);
CREATE INDEX IF NOT EXISTS case_document_exchange_items_package_idx
    ON public.case_document_exchange_items(package_id);
CREATE INDEX IF NOT EXISTS case_document_exchange_comments_thread_idx
    ON public.case_document_exchange_comments(thread_id, created_at ASC);

COMMENT ON TABLE public.case_document_exchange_threads IS
    'Private owner-and-assigned-attorney collaboration threads, isolated to one client case.';
COMMENT ON TABLE public.case_document_exchange_packages IS
    'Versioned outbound document packages in a case document exchange thread.';
COMMENT ON TABLE public.case_document_exchange_items IS
    'Case document records attached to one versioned document exchange package.';
COMMENT ON TABLE public.case_document_exchange_comments IS
    'In-app review notes for a private case document exchange thread.';
