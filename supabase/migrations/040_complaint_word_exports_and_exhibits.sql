-- Word-download derivatives and complaint-specific exhibit attachment support.
-- Original uploads remain in their existing storage paths.

ALTER TABLE public.case_documents
    ADD COLUMN IF NOT EXISTS word_document_path text;

ALTER TABLE public.case_documents
    ADD COLUMN IF NOT EXISTS parent_document_id uuid
    REFERENCES public.case_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_case_documents_parent_document
    ON public.case_documents(parent_document_id, created_at ASC)
    WHERE parent_document_id IS NOT NULL;

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
        'complaint',
        'complaint_exhibit',
        'requested_client_document',
        'pii',
        'signed_contract',
        'other'
    ));
