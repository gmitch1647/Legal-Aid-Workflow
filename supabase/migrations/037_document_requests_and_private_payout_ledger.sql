-- Client document request center and private settlement-payout ledger.
-- The payout ledger is intentionally owner-only and is not part of the client
-- settlement/closing-statement calculation or any client-visible view.

CREATE TABLE IF NOT EXISTS public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'client_document',
  due_date date,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'uploaded', 'cancelled')),
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_requests_case_created
  ON public.document_requests(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_requests_client_status
  ON public.document_requests(client_id, status);

CREATE TABLE IF NOT EXISTS public.document_request_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  case_document_id uuid REFERENCES public.case_documents(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_request_uploads_request
  ON public.document_request_uploads(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.settlement_payout_ledgers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  settlement_amount numeric(14,2) NOT NULL CHECK (settlement_amount >= 0),
  percentage numeric(7,4) NOT NULL DEFAULT 35 CHECK (percentage >= 0 AND percentage <= 100),
  expected_amount numeric(14,2) NOT NULL CHECK (expected_amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_payout_ledgers_owner_updated
  ON public.settlement_payout_ledgers(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.settlement_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES public.settlement_payout_ledgers(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  payment_method text,
  reference text,
  notes text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_payouts_ledger_date
  ON public.settlement_payouts(ledger_id, paid_on DESC);

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_payout_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document request participant access" ON public.document_requests;
CREATE POLICY "document request participant access" ON public.document_requests
  FOR SELECT USING (requested_by = auth.uid() OR client_id = auth.uid());

DROP POLICY IF EXISTS "document request upload participant access" ON public.document_request_uploads;
CREATE POLICY "document request upload participant access" ON public.document_request_uploads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.document_requests r
      WHERE r.id = request_id AND (r.requested_by = auth.uid() OR r.client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "private payout ledger owner only" ON public.settlement_payout_ledgers;
CREATE POLICY "private payout ledger owner only" ON public.settlement_payout_ledgers
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "private payout records owner only" ON public.settlement_payouts;
CREATE POLICY "private payout records owner only" ON public.settlement_payouts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.settlement_payout_ledgers l
      WHERE l.id = ledger_id AND l.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.settlement_payout_ledgers l
      WHERE l.id = ledger_id AND l.owner_id = auth.uid()
    )
  );
