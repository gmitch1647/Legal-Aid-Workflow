-- Reusable attorney supporting-document library and case attachments.
-- Library files are owned by the uploading LegalFlow attorney/staff account and
-- can be linked to many cases without duplicating the stored file.

create table if not exists public.supporting_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_type text,
  file_size bigint not null default 0,
  storage_path text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supporting_documents_owner_created_idx
  on public.supporting_documents(owner_id, created_at desc);

create table if not exists public.case_supporting_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  supporting_document_id uuid not null references public.supporting_documents(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  unique (case_id, supporting_document_id)
);

create index if not exists case_supporting_documents_case_idx
  on public.case_supporting_documents(case_id, added_at desc);

create index if not exists case_supporting_documents_owner_idx
  on public.case_supporting_documents(owner_id, added_at desc);
