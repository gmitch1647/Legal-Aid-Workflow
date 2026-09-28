-- Keep the attorney-scoped W-9 Center list ordered without a separate sort.
-- The index supports the exact filter/order used by GET /w9/attorney/requests.
CREATE INDEX IF NOT EXISTS idx_w9_requests_sent_by_created_at_desc
  ON public.w9_requests (sent_by, created_at DESC);
