-- 0000: extensions and text search configuration used by the catalog (FTS + trigram search, scheduling).
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_cron;

-- Immutable unaccent wrapper so it can be used in indexes and generated columns
-- (extensions.unaccent(text) is only STABLE because it depends on the search_path).
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

comment on function public.f_unaccent(text) is 'Immutable unaccent (fixed dictionary) for indexes on normalized text.';

-- Normalization for matching and fuzzy search: lower case, no diacritics, single spaces.
create or replace function public.norm_text(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$ select btrim(regexp_replace(lower(public.f_unaccent($1)), '\s+', ' ', 'g')) $$;

-- Full-text search config: "simple" (no stemming, works for ro + en + model codes) without diacritics.
do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'simple_unaccent') then
    create text search configuration public.simple_unaccent (copy = simple);
    alter text search configuration public.simple_unaccent
      alter mapping for hword, hword_part, word with extensions.unaccent, simple;
  end if;
end $$;
