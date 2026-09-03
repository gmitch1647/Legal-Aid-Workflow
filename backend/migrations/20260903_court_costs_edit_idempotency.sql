alter table public.court_cost_requests
  add column if not exists submission_key text;

create unique index if not exists court_cost_requests_submission_key_uidx
  on public.court_cost_requests(submission_key)
  where submission_key is not null;

create index if not exists court_cost_requests_case_status_idx
  on public.court_cost_requests(case_id, status);

alter table public.court_cost_requests
  add column if not exists edited_at timestamptz;

alter table public.court_cost_requests
  add column if not exists edited_by uuid references public.profiles(id) on delete set null;

alter table public.court_cost_requests
  add column if not exists last_edit_note text;

comment on column public.court_cost_requests.submission_key is 'Client-generated idempotency key for a single court-cost submission attempt.';
comment on column public.court_cost_requests.last_edit_note is 'Optional note describing the latest editable request change.';

notify pgrst, 'reload schema';
