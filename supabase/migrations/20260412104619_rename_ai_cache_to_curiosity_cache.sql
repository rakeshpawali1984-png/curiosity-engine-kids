-- Rename table
alter table ai_cache rename to curiosity_cache;

-- Rename indexes
alter index if exists idx_ai_cache_lookup rename to idx_curiosity_cache_lookup;
alter index if exists idx_ai_cache_expiry rename to idx_curiosity_cache_expiry;
alter index if exists idx_ai_cache_embedding rename to idx_curiosity_cache_embedding;
