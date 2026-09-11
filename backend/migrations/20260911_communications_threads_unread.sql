alter table public.communications add column if not exists read_at timestamptz;
alter table public.referral_partner_messages add column if not exists read_at timestamptz;

create index if not exists communications_thread_inbox_idx
  on public.communications (recipient_type, client_id, created_at desc);
create index if not exists communications_unread_inbox_idx
  on public.communications (recipient_type, client_id, created_at desc)
  where direction = 'inbound' and read_at is null;
create index if not exists referral_partner_messages_unread_idx
  on public.referral_partner_messages (referral_partner_id, created_at desc)
  where direction = 'inbound' and read_at is null;
