-- Store documents submitted with the public Credit Repair intake separately from legal case documents.
create table if not exists public.credit_repair_lead_documents (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references public.credit_repair_leads(id) on delete cascade,
    file_name text not null,
    file_type text not null default 'application/octet-stream',
    file_size bigint not null check (file_size >= 0),
    storage_path text not null,
    uploaded_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists credit_repair_lead_documents_lead_id_idx
    on public.credit_repair_lead_documents (lead_id, created_at desc);

comment on table public.credit_repair_lead_documents is
    'Secure metadata for supporting documents submitted with a Credit Repair lead. File bytes remain in the documents storage bucket.';
