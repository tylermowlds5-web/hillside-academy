-- ═══ RUN-THIS.sql — Step 15 runbook ═══════════════════════════════════════
-- Paste the whole file into the Supabase SQL editor. Re-run safe.
-- Contents = the Step 15 section of supabase/migrations.sql, verbatim.
-- After it runs: open /admin/ricky and press "Rebuild index" (or curl the
-- /api/cron/knowledge-rebuild route with the CRON_SECRET) to backfill.

-- ── Step 15: Ricky Bobby knowledge index (pgvector) ───────────────────────
-- Every content row on the site (plant pages, lesson pages, cert programs
-- and modules, videos, quiz questions, documents, learning paths) is
-- flattened into one searchable knowledge_index row with a title, a link to
-- the page it came from, plain text, and an embedding. The app writes it
-- (lib/knowledge-index.ts): a row is re-indexed whenever it is saved in
-- admin, and a nightly cron rebuilds everything and removes deleted rows.
-- Ricky Bobby retrieves from here per question (lib/knowledge-retrieval.ts).
--
-- Embeddings are 1024-dim (Voyage voyage-3.5-lite or OpenAI
-- text-embedding-3-small at 1024 dims — see lib/embeddings.ts). The
-- `search` tsvector is a full-text fallback so retrieval works even before
-- an embedding key is configured.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.knowledge_index (
  id uuid default gen_random_uuid() primary key,
  source_table text not null,
  -- Source row id. Quiz questions use "<quiz id>:<question index>".
  source_id text not null,
  -- Display label for citations ("Plant ID", "Video", "Quiz", ...).
  kind text not null default '',
  title text not null,
  url text not null,
  text text not null,
  -- Plant names for exact-name matching (common_name, also_called,
  -- botanical_name). Empty for everything but plant pages.
  aliases text[] not null default '{}',
  embedding vector(1024),
  -- sha256 of title+text; unchanged rows skip re-embedding on rebuild.
  text_hash text,
  search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(text, ''))
  ) stored,
  updated_at timestamp with time zone not null default now(),
  UNIQUE (source_table, source_id)
);
CREATE INDEX IF NOT EXISTS knowledge_index_embedding_idx
  ON public.knowledge_index USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS knowledge_index_search_idx
  ON public.knowledge_index USING gin (search);
CREATE INDEX IF NOT EXISTS knowledge_index_source_idx
  ON public.knowledge_index (source_table);

ALTER TABLE public.knowledge_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_index_admin_all" ON public.knowledge_index;
CREATE POLICY "knowledge_index_admin_all" ON public.knowledge_index
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Nearest neighbours by cosine similarity (score 1 = identical).
CREATE OR REPLACE FUNCTION public.knowledge_search_vector(
  query_embedding vector(1024),
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  id uuid, source_table text, source_id text, kind text, title text, url text,
  text text, score double precision
)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT k.id, k.source_table, k.source_id, k.kind, k.title, k.url, k.text,
         (1 - (k.embedding <=> query_embedding))::double precision AS score
  FROM public.knowledge_index k
  WHERE k.embedding IS NOT NULL
  ORDER BY k.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

-- Full-text search (websearch syntax) — the no-embedding fallback and the
-- keyword half of hybrid retrieval.
CREATE OR REPLACE FUNCTION public.knowledge_search_text(
  search_query text,
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  id uuid, source_table text, source_id text, kind text, title text, url text,
  text text, score double precision
)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT k.id, k.source_table, k.source_id, k.kind, k.title, k.url, k.text,
         ts_rank_cd(k.search, q)::double precision AS score
  FROM public.knowledge_index k,
       websearch_to_tsquery('english', search_query) q
  WHERE k.search @@ q
  ORDER BY score DESC
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

-- Ricky Bobby question log: what was asked, what was retrieved, what was
-- answered. Written by the chat route (service role); admins read it on
-- /admin/ricky.
CREATE TABLE IF NOT EXISTS public.ricky_questions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  question text not null,
  answer text,
  -- [{ title, kind, url, source_table, source_id, via, score }]
  retrieved jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now()
);
CREATE INDEX IF NOT EXISTS ricky_questions_created_idx
  ON public.ricky_questions (created_at DESC);

ALTER TABLE public.ricky_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ricky_questions_admin_read" ON public.ricky_questions;
CREATE POLICY "ricky_questions_admin_read" ON public.ricky_questions
  FOR SELECT TO authenticated USING (public.is_admin());
