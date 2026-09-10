-- ═══ RUN-THIS.sql — Step 17 runbook ═══════════════════════════════════════
-- Paste the whole file into the Supabase SQL editor. Re-run safe.
-- Contents = the Step 17 section of supabase/migrations.sql, verbatim.
-- (Steps 15 + 16 from the previous runbook are already applied.)
-- After it runs, /hillside-ai starts saving chats; nothing else to do.

-- ── Step 17: Ricky Bobby chat history ─────────────────────────────────────
-- Every Ricky Bobby conversation is saved per employee and can be reopened
-- and continued from the history sidebar on /hillside-ai. One ricky_chats
-- row per conversation (title = the first question, trimmed), one
-- ricky_messages row per turn. No expiry — chats live until the employee
-- deletes them (or the employee's profile is deleted, which cascades).
--
-- Chats are PRIVATE to their owner: RLS lets only auth.uid() = user_id read
-- or change them. Admin oversight stays on ricky_questions (/admin/ricky),
-- which the chat route keeps writing exactly as before.

CREATE TABLE IF NOT EXISTS public.ricky_chats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamp with time zone not null default now(),
  -- Bumped every time a message is added; the sidebar sorts by it.
  updated_at timestamp with time zone not null default now()
);
CREATE INDEX IF NOT EXISTS ricky_chats_user_updated_idx
  ON public.ricky_chats (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ricky_messages (
  id uuid default gen_random_uuid() primary key,
  chat_id uuid not null references public.ricky_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Assistant turns: what was retrieved for that answer, same shape as
  -- ricky_questions.retrieved. Null on user turns.
  sources jsonb,
  created_at timestamp with time zone not null default now()
);
CREATE INDEX IF NOT EXISTS ricky_messages_chat_created_idx
  ON public.ricky_messages (chat_id, created_at);

ALTER TABLE public.ricky_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ricky_chats_owner" ON public.ricky_chats;
CREATE POLICY "ricky_chats_owner" ON public.ricky_chats
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.ricky_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ricky_messages_owner" ON public.ricky_messages;
CREATE POLICY "ricky_messages_owner" ON public.ricky_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ricky_chats c WHERE c.id = chat_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ricky_chats c WHERE c.id = chat_id AND c.user_id = auth.uid()));
