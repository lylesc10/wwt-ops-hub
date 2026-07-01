-- DocGen: documents table
create table if not exists documents (
  id                       uuid primary key default gen_random_uuid(),
  title                    text not null default 'Untitled Document',
  doc_type                 text not null default 'Deployment Guide',
  schema_data              jsonb,
  status                   text not null default 'draft'
                             check (status in ('generating','draft','in_review','approved')),
  generation_progress      text,
  generation_time_seconds  float,
  context                  jsonb,  -- question answers used to generate this doc
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Index for listing by user/date
create index if not exists documents_created_at_idx on documents(created_at desc);

-- RLS: authenticated users can manage their own documents; admins see all
alter table documents enable row level security;

create policy "users manage own documents"
  on documents for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- Trigger: keep updated_at fresh
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger documents_updated_at
  before update on documents
  for each row execute function set_updated_at();
