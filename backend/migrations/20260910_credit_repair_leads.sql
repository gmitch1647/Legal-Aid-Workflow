create extension if not exists pgcrypto;

create table if not exists public.credit_repair_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_to uuid references public.profiles(id) on delete set null,
  source text not null default 'credit_repair_form',
  status text not null default 'new' check (status in ('new','contacted','qualified','documents_pending','active','not_qualified','closed')),
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  state text,
  street_address text,
  city text,
  zip text,
  case_type text,
  adverse_party text,
  description text,
  notes text,
  last_contacted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists credit_repair_leads_status_idx on public.credit_repair_leads(status);
create index if not exists credit_repair_leads_created_at_idx on public.credit_repair_leads(created_at desc);
create index if not exists credit_repair_leads_assigned_to_idx on public.credit_repair_leads(assigned_to);

create or replace function public.set_credit_repair_leads_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists credit_repair_leads_updated_at on public.credit_repair_leads;
create trigger credit_repair_leads_updated_at
before update on public.credit_repair_leads
for each row execute function public.set_credit_repair_leads_updated_at();

alter table public.credit_repair_leads enable row level security;

drop policy if exists credit_repair_leads_service_access on public.credit_repair_leads;
create policy credit_repair_leads_service_access on public.credit_repair_leads
for all using (true) with check (true);

comment on table public.credit_repair_leads is 'Leads submitted through the dedicated credit-repair intake form; intentionally separate from legal cases.';

-- Optional compatibility columns for databases that already use an updated_at trigger convention.
select 1;

insert into public.credit_repair_leads (full_name, email, source)
select 'Migration placeholder', null, 'migration_placeholder'
where false;

-- Remove the no-op placeholder if the SQL client reports it as unnecessary.
delete from public.credit_repair_leads where source = 'migration_placeholder' and full_name = 'Migration placeholder';

-- The migration intentionally contains no seed data.
