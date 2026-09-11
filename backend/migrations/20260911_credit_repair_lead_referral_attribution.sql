alter table public.credit_repair_leads add column if not exists referral_partner_id uuid references public.referral_partners(id) on delete set null;
create index if not exists credit_repair_leads_referral_partner_idx on public.credit_repair_leads(referral_partner_id);
comment on column public.credit_repair_leads.referral_partner_id is 'Referral partner associated with the public credit-repair form link used for this lead.';
