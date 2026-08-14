-- Preserve the original completed W-9 while linking a replacement request issued
-- only to correct a missing or invalid signature image.
ALTER TABLE public.w9_requests
  ADD COLUMN IF NOT EXISTS corrects_request_id UUID
  REFERENCES public.w9_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_w9_requests_corrects_request
  ON public.w9_requests(corrects_request_id);
