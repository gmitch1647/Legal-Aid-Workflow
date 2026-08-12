-- Allow each secure payout-information request to be completed from a private,
-- high-entropy, expiring link without a LegalFlow account.

alter table public.client_payout_information_requests
  add column if not exists token text,
  add column if not exists expires_at timestamptz;

create unique index if not exists client_payout_information_requests_token_unique_idx
  on public.client_payout_information_requests(token)
  where token is not null;

create index if not exists client_payout_information_requests_token_lookup_idx
  on public.client_payout_information_requests(token)
  where token is not null;
