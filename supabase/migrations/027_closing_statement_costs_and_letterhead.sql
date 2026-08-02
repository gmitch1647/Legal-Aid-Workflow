-- 027_closing_statement_costs_and_letterhead.sql
-- Preserve the complete settlement distribution and the attorney/firm letterhead
-- used when each closing statement is generated.

ALTER TABLE public.closing_statements
    ADD COLUMN IF NOT EXISTS court_cost_cents bigint NOT NULL DEFAULT 0
        CHECK (court_cost_cents >= 0),
    ADD COLUMN IF NOT EXISTS service_of_process_cost_cents bigint NOT NULL DEFAULT 0
        CHECK (service_of_process_cost_cents >= 0),
    ADD COLUMN IF NOT EXISTS attorney_id uuid
        REFERENCES public.attorneys(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS letterhead_firm_name text,
    ADD COLUMN IF NOT EXISTS letterhead_address text,
    ADD COLUMN IF NOT EXISTS letterhead_phone text,
    ADD COLUMN IF NOT EXISTS letterhead_email text;

CREATE INDEX IF NOT EXISTS idx_closing_statements_attorney_id
    ON public.closing_statements(attorney_id)
    WHERE attorney_id IS NOT NULL;

COMMENT ON COLUMN public.closing_statements.court_cost_cents IS
    'Court costs included in the settlement distribution, stored in integer cents.';
COMMENT ON COLUMN public.closing_statements.service_of_process_cost_cents IS
    'Service-of-process costs included in the settlement distribution, stored in integer cents.';
COMMENT ON COLUMN public.closing_statements.attorney_id IS
    'Selected attorney record used to create the closing-statement letterhead.';
COMMENT ON COLUMN public.closing_statements.letterhead_firm_name IS
    'Firm name snapshot rendered on the generated closing statement.';
COMMENT ON COLUMN public.closing_statements.letterhead_address IS
    'Office-address snapshot rendered on the generated closing statement.';
COMMENT ON COLUMN public.closing_statements.letterhead_phone IS
    'Office-phone snapshot rendered on the generated closing statement.';
COMMENT ON COLUMN public.closing_statements.letterhead_email IS
    'Office-email snapshot rendered on the generated closing statement.';
