create or replace function public.match_knowledge_chunks(
  query_embedding vector(3072),
  match_count integer default 12,
  filter_subject text default null,
  filter_class text default null,
  filter_chapter text default null,
  filter_exam text default null
)
returns table (id uuid, similarity double precision)
language sql stable security invoker set search_path = public as $$
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
language sql stable security invoker set search_path = public as $$
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

revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
revoke execute on function public.is_knowledge_editor() from anon, public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_knowledge_editor() to authenticated, service_role;