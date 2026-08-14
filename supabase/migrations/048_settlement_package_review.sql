-- Migration 048: Attorney settlement package submission and review workflow

CREATE TABLE IF NOT EXISTS public.settlement_package_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'awaiting_review'
    CHECK (status IN ('awaiting_review', 'approved', 'returned')),
  settlement_file_name text NOT NULL,
  settlement_storage_path text NOT NULL,
  settlement_file_size bigint,
  credit_disclosure_file_name text,
  credit_disclosure_storage_path text,
  credit_disclosure_file_size bigint,
  settlement_amount text,
  attorney_notes text,
  review_comments text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  settlement_document_id uuid REFERENCES public.case_documents(id) ON DELETE SET NULL,
  credit_disclosure_document_id uuid REFERENCES public.case_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_settlement_package_submissions_case
  ON public.settlement_package_submissions(case_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_package_submissions_status
  ON public.settlement_package_submissions(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.settlement_package_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.settlement_package_submissions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('submitted', 'approved', 'returned', 'settlement_sent', 'credit_disclosure_sent')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_package_events_package
  ON public.settlement_package_events(package_id, created_at DESC);

ALTER TABLE public.settlement_package_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_package_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlement_package_submissions_internal ON public.settlement_package_submissions
  FOR ALL USING (public.is_attorney()) WITH CHECK (public.is_attorney());
CREATE POLICY settlement_package_events_internal ON public.settlement_package_events
  FOR ALL USING (public.is_attorney()) WITH CHECK (public.is_attorney());
