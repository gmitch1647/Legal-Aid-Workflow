create table if not exists public.court_cost_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete set null,
  referral_partner_id uuid references public.referral_partners(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  expense_date date not null,
  court_name text not null,
  description text not null,
  receipt_url text,
  status text not null default 'submitted' check (status in ('draft','submitted','needs_correction','approved','awaiting_payment','paid','disputed')),
  correction_note text,
  paid_amount numeric(12,2) check (paid_amount is null or paid_amount >= 0),
  payment_date date,
  payment_method text,
  payment_reference text,
  payment_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  paid_by uuid references public.profiles(id) on delete set null,
  paid_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists court_cost_requests_case_id_idx on public.court_cost_requests(case_id);
create index if not exists court_cost_requests_referral_partner_id_idx on public.court_cost_requests(referral_partner_id);
create index if not exists court_cost_requests_status_idx on public.court_cost_requests(status);
create index if not exists court_cost_requests_created_at_idx on public.court_cost_requests(created_at desc);

create table if not exists public.court_cost_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.court_cost_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  from_status text,
  to_status text,
  note text,
  amount numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists court_cost_events_request_id_idx on public.court_cost_events(request_id, created_at desc);

alter table public.court_cost_requests enable row level security;
alter table public.court_cost_events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'court_cost_requests' and policyname = 'service role court cost requests') then
    create policy "service role court cost requests" on public.court_cost_requests for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'court_cost_events' and policyname = 'service role court cost events') then
    create policy "service role court cost events" on public.court_cost_events for all to service_role using (true) with check (true);
  end if;
end $$;
