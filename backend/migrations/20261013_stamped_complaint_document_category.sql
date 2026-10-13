-- Allow court-stamped filings to be recorded separately from editable drafts.
ALTER TABLE public.case_documents
    DROP CONSTRAINT IF EXISTS case_documents_document_category_check;

ALTER TABLE public.case_documents
    ADD CONSTRAINT case_documents_document_category_check
    CHECK (
        document_category = ANY (
            ARRAY[
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
                'stamped_complaint',
                'requested_client_document',
                'pii',
                'signed_contract',
                'other'
            ]
        )
    );
