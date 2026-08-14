-- Migration 052: Owner-approved attorney access to client payout details.
-- Full bank numbers remain only in the encrypted payout submission table.

CREATE TABLE IF NOT EXISTS public.payout_attorney_payment_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.client_payout_information_requests(id) ON DELETE CASCADE,
  attorney_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  released_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  released_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'released' CHECK (status IN ('released', 'revoked', 'payment_marked_sent')),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_amount numeric(12,2),
  payment_sent_at timestamptz,
  payment_reference text,
  payment_note text,
  payment_marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_marked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payout_attorney_payment_access_attorney_status_idx
  ON public.payout_attorney_payment_access(attorney_profile_id, status, released_at DESC);

ALTER TABLE public.payout_information_access_audit
  DROP CONSTRAINT IF EXISTS payout_information_access_audit_action_check;
ALTER TABLE public.payout_information_access_audit
  ADD CONSTRAINT payout_information_access_audit_action_check
  CHECK (action IN ('submitted', 'revealed', 'released_to_attorney', 'release_revoked', 'payment_marked_sent'));

ALTER TABLE public.payout_attorney_payment_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_attorney_payment_access_attorney_read
  ON public.payout_attorney_payment_access
  FOR SELECT USING (public.is_attorney());
