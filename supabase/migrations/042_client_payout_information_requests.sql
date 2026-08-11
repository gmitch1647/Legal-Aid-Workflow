-- Secure client ACH payout-information requests.
-- Routing and account numbers are encrypted in the backend before insertion and
-- intentionally have no plaintext database columns.

create table if not exists public.client_payout_information_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  message text,
  due_date date,
  status text not null default 'requested' check (status in ('requested', 'completed', 'cancelled')),
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_payout_information_requests_case_created_idx
  on public.client_payout_information_requests(case_id, created_at desc);

create index if not exists client_payout_information_requests_client_status_idx
  on public.client_payout_information_requests(client_id, status, created_at desc);

create table if not exists public.client_payout_information_submissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.client_payout_information_requests(id) on delete cascade,
  account_holder_name text not null,
  account_type text not null check (account_type in ('checking', 'savings')),
  bank_name text,
  routing_number_encrypted text not null,
  account_number_encrypted text not null,
  account_number_last4 text not null check (char_length(account_number_last4) = 4),
  certified_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  signer_ip text,
  ip_source text,
  user_agent text
);

create table if not exists public.payout_information_access_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.client_payout_information_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('submitted', 'revealed')),
  actor_ip text,
  ip_source text,
  created_at timestamptz not null default now()
);

create index if not exists payout_information_access_audit_request_created_idx
  on public.payout_information_access_audit(request_id, created_at desc);
