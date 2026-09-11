alter table public.communications add column if not exists provider_event_id text;
alter table public.communications add column if not exists provider_message_id text;
alter table public.communications add column if not exists sender text;
alter table public.communications add column if not exists received_at timestamptz;
create unique index if not exists communications_provider_event_id_idx on public.communications(provider_event_id) where provider_event_id is not null;
