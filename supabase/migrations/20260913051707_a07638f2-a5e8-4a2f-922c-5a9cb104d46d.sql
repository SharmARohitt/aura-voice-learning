-- ─── extensions ────────────────────────────────────────────────────────────
create extension if not exists vector with schema public;
create extension if not exists pg_trgm with schema public;

-- ─── roles ─────────────────────────────────────────────────────────────────
do $$ begin
  create type public.app_role as enum ('admin', 'editor', 'user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_knowledge_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor')
$$;

create policy "Users read their own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);
create policy "Admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ─── sources ───────────────────────────────────────────────────────────────
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  publisher text not null default '',
  url text,
  source_type text not null default 'web',
  license text not null default 'unknown',
  access_status text not null default 'unknown',
  excerpt_only boolean not null default false,
  robots_allowed boolean,
  crawl_status text not null default 'idle',
  last_crawled_at timestamptz,
  checksum text,
  document_count integer not null default 0,
  chunk_count integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.sources to anon;
grant select, insert, update, delete on public.sources to authenticated;
grant all on public.sources to service_role;
alter table public.sources enable row level security;
create policy "Sources are publicly readable" on public.sources for select using (true);
create policy "Editors manage sources" on public.sources for all to authenticated
  using (public.is_knowledge_editor()) with check (public.is_knowledge_editor());

-- ─── documents ─────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  parent_document_id uuid references public.documents(id) on delete set null,
  title text not null,
  source_url text,
  source_type text not null default 'web',
  subject text not null default '',
  class_level text not null default '',
  board text not null default '',
  exams text[] not null default '{}',
  chapter text not null default '',
  language text not null default 'en',
  content text,
  content_hash text,
  page_count integer,
  metadata jsonb not null default '{}'::jsonb,
  approval_status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.documents to anon;
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "Documents are publicly readable" on public.documents for select using (true);
create policy "Editors manage documents" on public.documents for all to authenticated
  using (public.is_knowledge_editor()) with check (public.is_knowledge_editor());

create index if not exists documents_source_idx on public.documents (source_id);
create index if not exists documents_subject_class_idx on public.documents (subject, class_level);

-- ─── knowledge chunks ──────────────────────────────────────────────────────
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  document_id uuid references public.documents(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  source_name text not null default '',
  source_url text,
  source_type text not null default 'lecture_transcript',
  title text not null default '',
  subject text not null default '',
  class_level text not null default '',
  board text not null default '',
  exams text[] not null default '{}',
  chapter text not null default '',
  topic text not null default '',
  subtopic text,
  concept text,
  concepts text[] not null default '{}',
  content text not null,
  language text not null default 'en',
  difficulty text not null default 'medium',
  prerequisites text[] not null default '{}',
  keywords text[] not null default '{}',
  formulas text[] not null default '{}',
  examples text[] not null default '{}',
  learning_objective text,
  page_number integer,
  section text,
  teacher text,
  timestamp_start text,
  timestamp_end text,
  lecture_id text,
  lecture_title text,
  lecture_number integer,
  course_id text,
  confidence numeric not null default 0.8,
  approval_status text not null default 'pending',
  content_hash text not null,
  embedding vector(3072),
  embedding_version text,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.knowledge_chunks to anon;
grant select, insert, update, delete on public.knowledge_chunks to authenticated;
grant all on public.knowledge_chunks to service_role;
alter table public.knowledge_chunks enable row level security;
create policy "Approved chunks are publicly readable" on public.knowledge_chunks
  for select using (approval_status = 'approved' or public.is_knowledge_editor());
create policy "Editors manage chunks" on public.knowledge_chunks for all to authenticated
  using (public.is_knowledge_editor()) with check (public.is_knowledge_editor());

create unique index if not exists knowledge_chunks_hash_idx on public.knowledge_chunks (content_hash);
create index if not exists knowledge_chunks_filter_idx
  on public.knowledge_chunks (subject, class_level, chapter, approval_status);
create index if not exists knowledge_chunks_document_idx on public.knowledge_chunks (document_id);
create index if not exists knowledge_chunks_fts_idx
  on public.knowledge_chunks using gin (to_tsvector('simple', coalesce(content,'') || ' ' || coalesce(topic,'') || ' ' || coalesce(chapter,'')));
create index if not exists knowledge_chunks_trgm_idx
  on public.knowledge_chunks using gin (content gin_trgm_ops);
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

-- ─── concepts + graph ──────────────────────────────────────────────────────
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  subject text not null default '',
  class_level text not null default '',
  chapter text not null default '',
  aliases text[] not null default '{}',
  hindi_terms text[] not null default '{}',
  hinglish_terms text[] not null default '{}',
  exams text[] not null default '{}',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.concepts to anon;
grant select, insert, update, delete on public.concepts to authenticated;
grant all on public.concepts to service_role;
alter table public.concepts enable row level security;
create policy "Concepts are publicly readable" on public.concepts for select using (true);
create policy "Editors manage concepts" on public.concepts for all to authenticated
  using (public.is_knowledge_editor()) with check (public.is_knowledge_editor());

create table if not exists public.concept_edges (
  id uuid primary key default gen_random_uuid(),
  from_concept uuid not null references public.concepts(id) on delete cascade,
  to_concept uuid not null references public.concepts(id) on delete cascade,
  relation text not null default 'related',
  weight numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (from_concept, to_concept, relation)
);

grant select on public.concept_edges to anon;
grant select, insert, update, delete on public.concept_edges to authenticated;
grant all on public.concept_edges to service_role;
alter table public.concept_edges enable row level security;
create policy "Concept edges are publicly readable" on public.concept_edges for select using (true);
create policy "Editors manage concept edges" on public.concept_edges for all to authenticated
  using (public.is_knowledge_editor()) with check (public.is_knowledge_editor());

-- ─── ingestion jobs ────────────────────────────────────────────────────────
create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete cascade,
  job_type text not null default 'web',
  input_url text,
  input_title text,
  status text not null default 'queued',
  stage text not null default 'queued',
  retry_count integer not null default 0,
  documents_created integer not null default 0,
  chunks_created integer not null default 0,
  duplicates_skipped integer not null default 0,
  embeddings_created integer not null default 0,
  embedding_failures integer not null default 0,
  duration_ms integer,
  error text,
  log jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.ingestion_jobs to authenticated;
grant all on public.ingestion_jobs to service_role;
alter table public.ingestion_jobs enable row level security;
create policy "Editors manage ingestion jobs" on public.ingestion_jobs for all to authenticated
  using (public.is_knowledge_editor()) with check (public.is_knowledge_editor());

create index if not exists ingestion_jobs_status_idx on public.ingestion_jobs (status, created_at desc);

-- ─── edits audit ───────────────────────────────────────────────────────────
create table if not exists public.knowledge_edits (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid references public.knowledge_chunks(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  action text not null,
  field text,
  before_value jsonb,
  after_value jsonb,
  edited_by uuid,
  created_at timestamptz not null default now()
);

grant select, insert on public.knowledge_edits to authenticated;
grant all on public.knowledge_edits to service_role;
alter table public.knowledge_edits enable row level security;
create policy "Editors read edits" on public.knowledge_edits for select to authenticated
  using (public.is_knowledge_editor());
create policy "Editors write edits" on public.knowledge_edits for insert to authenticated
  with check (public.is_knowledge_editor());

-- ─── metrics ───────────────────────────────────────────────────────────────
create table if not exists public.ingestion_metrics (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  value numeric not null default 0,
  unit text not null default 'ms',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant select on public.ingestion_metrics to authenticated;
grant all on public.ingestion_metrics to service_role;
alter table public.ingestion_metrics enable row level security;
create policy "Editors read metrics" on public.ingestion_metrics for select to authenticated
  using (public.is_knowledge_editor());

create index if not exists ingestion_metrics_metric_idx on public.ingestion_metrics (metric, created_at desc);

-- ─── updated_at triggers ───────────────────────────────────────────────────
create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger knowledge_chunks_updated_at before update on public.knowledge_chunks
  for each row execute function public.set_updated_at();
create trigger concepts_updated_at before update on public.concepts
  for each row execute function public.set_updated_at();
create trigger ingestion_jobs_updated_at before update on public.ingestion_jobs
  for each row execute function public.set_updated_at();

-- ─── search helpers ────────────────────────────────────────────────────────
create or replace function public.match_knowledge_chunks(
  query_embedding vector(3072),
  match_count integer default 12,
  filter_subject text default null,
  filter_class text default null,
  filter_chapter text default null,
  filter_exam text default null
)
returns table (id uuid, similarity double precision)
language sql stable security definer set search_path = public as $$
  select k.id,
         1 - (k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from public.knowledge_chunks k
  where k.approval_status = 'approved'
    and k.embedding is not null
    and (filter_subject is null or k.subject = filter_subject)
    and (filter_class is null or k.class_level = filter_class)
    and (filter_chapter is null or k.chapter = filter_chapter)
    and (filter_exam is null or filter_exam = any(k.exams))
  order by k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit match_count;
$$;

create or replace function public.search_knowledge_chunks(
  query_text text,
  match_count integer default 24,
  filter_subject text default null,
  filter_class text default null,
  filter_chapter text default null,
  filter_exam text default null
)
returns setof public.knowledge_chunks
language sql stable security definer set search_path = public as $$
  select k.*
  from public.knowledge_chunks k
  where k.approval_status = 'approved'
    and (filter_subject is null or k.subject = filter_subject)
    and (filter_class is null or k.class_level = filter_class)
    and (filter_chapter is null or k.chapter = filter_chapter)
    and (filter_exam is null or filter_exam = any(k.exams))
    and (
      to_tsvector('simple', coalesce(k.content,'') || ' ' || coalesce(k.topic,'') || ' ' || coalesce(k.chapter,'') || ' ' || array_to_string(k.concepts, ' '))
      @@ plainto_tsquery('simple', query_text)
      or k.content ilike '%' || query_text || '%'
    )
  limit match_count;
$$;

grant execute on function public.match_knowledge_chunks(vector, integer, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.search_knowledge_chunks(text, integer, text, text, text, text) to anon, authenticated, service_role;