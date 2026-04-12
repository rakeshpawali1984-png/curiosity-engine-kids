drop function if exists public.vector_search_cache(vector, float, int);

create or replace function public.vector_search_cache(
    search_embedding vector(1536),
    match_threshold float default 0.80,
    match_count int default 3,
    filter_prompt_type text default null,
    filter_model text default null,
    filter_prompt_version text default null
)
returns table(
    id bigint,
    cache_key text,
    prompt_type text,
    model text,
    prompt_version text,
    query_raw text,
    query_norm text,
    response_json jsonb,
    safety_status text,
    hit_count integer,
    created_at timestamptz,
    expires_at timestamptz,
    similarity float
)
language sql
stable
as $$
    select
        c.id,
        c.cache_key,
        c.prompt_type,
        c.model,
        c.prompt_version,
        c.query_raw,
        c.query_norm,
        c.response_json,
        c.safety_status,
        c.hit_count,
        c.created_at,
        c.expires_at,
        1 - (c.query_embedding <=> search_embedding) as similarity
    from public.curiosity_cache c
    where c.query_embedding is not null
      and c.expires_at > now()
      and (filter_prompt_type is null or c.prompt_type = filter_prompt_type)
      and (filter_model is null or c.model = filter_model)
      and (filter_prompt_version is null or c.prompt_version = filter_prompt_version)
      and 1 - (c.query_embedding <=> search_embedding) >= match_threshold
    order by c.query_embedding <=> search_embedding
    limit match_count;
$$;