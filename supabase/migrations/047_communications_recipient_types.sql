-- Migration 047: Separate client and attorney communication recipients
-- Existing communications remain client communications for backward compatibility.

ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'client';

ALTER TABLE public.communications
  DROP CONSTRAINT IF EXISTS communications_recipient_type_check;

ALTER TABLE public.communications
  ADD CONSTRAINT communications_recipient_type_check
  CHECK (recipient_type IN ('client', 'attorney'));

CREATE INDEX IF NOT EXISTS idx_communications_recipient_type_client
  ON public.communications (recipient_type, client_id, created_at DESC);
