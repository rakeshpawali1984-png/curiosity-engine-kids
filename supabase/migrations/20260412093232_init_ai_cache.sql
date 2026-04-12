create extension if not exists vector;

create table if not exists ai_cache (
	id bigserial primary key,
	cache_key text not null unique,
	prompt_type text not null,
	model text not null,
	prompt_version text not null,
	query_raw text not null,
	query_norm text not null,
	query_embedding vector(1536),
	response_json jsonb not null,
	safety_status text,
	similarity_used real,
	hit_count integer not null default 0,
	created_at timestamptz not null default now(),
	last_accessed_at timestamptz not null default now(),
	expires_at timestamptz not null
);

create index if not exists idx_ai_cache_lookup
	on ai_cache (prompt_type, model, prompt_version, query_norm);

create index if not exists idx_ai_cache_expiry
	on ai_cache (expires_at);

create index if not exists idx_ai_cache_embedding
	on ai_cache using hnsw (query_embedding vector_cosine_ops);
