-- Run this in your Supabase SQL editor
-- Re-run safe — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING

-- Deactivate users without deleting their data
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Timestamp of the user's most recent successful sign-in. Updated by the login
-- flow (recordLogin server action). The Progress Report's "Last Active" column
-- falls back to watch/quiz activity when this is null. Backfilled at the bottom
-- of this file for existing users.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login timestamp with time zone;

-- Track whether the employee has passed the quiz for each video.
-- Kept in sync with quiz_attempts by submitQuizAttempt.
ALTER TABLE public.progress
  ADD COLUMN IF NOT EXISTS quiz_passed boolean NOT NULL DEFAULT false;

-- Real playback time the employee has actually watched, in seconds. Distinct
-- from percent_watched (scrubber position): skipping ahead moves the scrubber
-- but does NOT increase this. Completion now requires watching ≥85% of the
-- video's duration in real playback time (see updateVideoProgress).
ALTER TABLE public.progress
  ADD COLUMN IF NOT EXISTS actual_seconds_watched integer NOT NULL DEFAULT 0;

-- ── Employee Roles / Groups ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  assigned_at timestamp with time zone default now(),
  UNIQUE(user_id, role_id)
);

-- ── Category management tables ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.sub_categories (
  id uuid default gen_random_uuid() primary key,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now(),
  UNIQUE (category_id, name)
);

-- Migrate existing category text values from videos into categories table
INSERT INTO public.categories (name, sort_order)
SELECT DISTINCT category, (ROW_NUMBER() OVER (ORDER BY category))::integer - 1
FROM public.videos
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;

-- Migrate existing sub_category text values into sub_categories table
INSERT INTO public.sub_categories (category_id, name, sort_order)
SELECT DISTINCT c.id, v.sub_category, (ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY v.sub_category))::integer - 1
FROM public.videos v
INNER JOIN public.categories c ON c.name = v.category
WHERE v.sub_category IS NOT NULL AND v.sub_category != ''
ON CONFLICT (category_id, name) DO NOTHING;

-- Add FK columns to videos (referencing new tables)
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS category_id uuid references public.categories(id) on delete set null,
  ADD COLUMN IF NOT EXISTS sub_category_id uuid references public.sub_categories(id) on delete set null;

-- Backfill category_id from existing category text
UPDATE public.videos v
SET category_id = c.id
FROM public.categories c
WHERE v.category = c.name AND v.category IS NOT NULL AND v.category_id IS NULL;

-- Backfill sub_category_id from existing sub_category text
UPDATE public.videos v
SET sub_category_id = sc.id
FROM public.sub_categories sc
INNER JOIN public.categories c ON c.id = sc.category_id
WHERE v.sub_category = sc.name AND v.category = c.name AND v.sub_category IS NOT NULL AND v.sub_category_id IS NULL;

-- 1. Add sub_category and sort_order columns to videos
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- 2. Quizzes table (JSONB questions — no separate questions/options tables needed)
CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid default gen_random_uuid() primary key,
  video_id uuid references public.videos(id) on delete cascade,
  questions jsonb not null default '[]',
  passing_score integer not null default 80,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 3. Quiz attempts
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete cascade,
  score integer not null,
  passed boolean not null default false,
  taken_at timestamp with time zone default now()
);

-- 4. Store quiz answers and video_id with each attempt
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS answers jsonb,
  ADD COLUMN IF NOT EXISTS video_id uuid references public.videos(id) on delete set null;

-- ── Learning Paths ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.learning_paths (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  is_required boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.learning_path_items (
  id uuid default gen_random_uuid() primary key,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now(),
  UNIQUE (path_id, video_id)
);

CREATE TABLE IF NOT EXISTS public.learning_path_assignments (
  id uuid default gen_random_uuid() primary key,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamp with time zone default now(),
  completed_at timestamp with time zone,
  UNIQUE (path_id, user_id)
);

-- Add completed_at if the table already existed without it
ALTER TABLE public.learning_path_assignments
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- ── Documents ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  file_url text not null,
  file_type text,
  file_size bigint,
  category_id uuid references public.categories(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.document_views (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  viewed_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.learning_path_documents (
  id uuid default gen_random_uuid() primary key,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now(),
  UNIQUE (path_id, document_id)
);

-- 5. RLS policies (adjust as needed for your existing RLS setup)
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read quizzes
CREATE POLICY IF NOT EXISTS "quizzes_read" ON public.quizzes
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert their own attempts
CREATE POLICY IF NOT EXISTS "quiz_attempts_insert" ON public.quiz_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to read their own attempts
CREATE POLICY IF NOT EXISTS "quiz_attempts_read" ON public.quiz_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Cascade deletes for video-dependent rows ──────────────────────────────
-- Deleting a video must remove its assignments / progress / watch events so
-- they never linger as un-clickable "ghosts" on employee dashboards. Doing it
-- via ON DELETE CASCADE guarantees the sweep even when the delete runs under a
-- session whose RLS can't touch other users' rows.

-- 1. Remove any already-orphaned rows (video_id pointing at a deleted video).
--    Must happen BEFORE adding the FK, or the constraint creation would fail.
DELETE FROM public.assignments        WHERE video_id IS NOT NULL AND video_id NOT IN (SELECT id FROM public.videos);
DELETE FROM public.progress           WHERE video_id IS NOT NULL AND video_id NOT IN (SELECT id FROM public.videos);

DO $$
BEGIN
  IF to_regclass('public.video_watch_events') IS NOT NULL THEN
    DELETE FROM public.video_watch_events WHERE video_id IS NOT NULL AND video_id NOT IN (SELECT id FROM public.videos);
  END IF;
  IF to_regclass('public.learning_path_items') IS NOT NULL THEN
    DELETE FROM public.learning_path_items WHERE video_id IS NOT NULL AND video_id NOT IN (SELECT id FROM public.videos);
  END IF;
END $$;

-- 2. Drop whatever FK currently links each table's video_id to videos (name
--    unknown / may not exist), then re-add it with ON DELETE CASCADE. Wrapped
--    in a loop so it's idempotent and re-run safe.
DO $$
DECLARE
  tbl text;
  con record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['assignments', 'progress', 'video_watch_events', 'learning_path_items']
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    -- Drop existing FK(s) on this table that reference public.videos
    FOR con IN
      SELECT conname
      FROM pg_constraint
      WHERE contype = 'f'
        AND conrelid = ('public.' || tbl)::regclass
        AND confrelid = 'public.videos'::regclass
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, con.conname);
    END LOOP;

    -- Re-create it with ON DELETE CASCADE
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE',
      tbl, tbl || '_video_id_fkey'
    );
  END LOOP;
END $$;

-- ── Standalone quizzes ────────────────────────────────────────────────
-- Quizzes that are NOT attached to any video. Assigned and taken on their own,
-- with their own attempts table (no video_id, no progress sync).

CREATE TABLE IF NOT EXISTS public.standalone_quizzes (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  questions jsonb not null default '[]',
  passing_score integer default 80,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.standalone_quiz_assignments (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.standalone_quizzes(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  due_date date,
  assigned_at timestamp with time zone default now(),
  UNIQUE(quiz_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.standalone_quiz_attempts (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.standalone_quizzes(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  score integer not null,
  passed boolean not null,
  answers jsonb default '[]',
  taken_at timestamp with time zone default now()
);

-- ── Watch-event de-duplication ────────────────────────────────────────────
-- Historically a new video_watch_events row was inserted every ~30s, leaving
-- many duplicate rows per user/video/day. The app now keeps ONE row per user
-- per video per calendar day (see logWatchEvent). This one-time cleanup
-- collapses existing duplicates: for each (user_id, video_id, day) it keeps the
-- row with the highest percent_watched (then most seconds, then most recent)
-- and deletes the rest. Idempotent — re-running is a no-op once de-duped.
DO $$
BEGIN
  IF to_regclass('public.video_watch_events') IS NOT NULL THEN
    DELETE FROM public.video_watch_events e
    USING (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY user_id, video_id, ((watched_at AT TIME ZONE 'UTC')::date)
          ORDER BY percent_watched DESC, seconds_watched DESC, watched_at DESC
        ) AS rn
      FROM public.video_watch_events
    ) d
    WHERE e.id = d.id AND d.rn > 1;
  END IF;
END $$;

-- ── Backfill profiles.last_login from activity ────────────────────────────
-- Existing users never had last_login recorded, so the Progress Report showed
-- "Never" even when they'd watched videos or taken quizzes. For every user
-- whose last_login is null, set it to their most recent activity timestamp
-- across watch events and (video + standalone) quiz attempts. Idempotent — once
-- set, last_login is no longer null so a re-run skips it. Each source table is
-- guarded so this runs even if a table is absent.
DO $$
DECLARE
  parts text[] := ARRAY[]::text[];
  union_sql text;
BEGIN
  IF to_regclass('public.video_watch_events') IS NOT NULL THEN
    parts := array_append(parts, 'SELECT user_id, watched_at AS ts FROM public.video_watch_events');
  END IF;
  IF to_regclass('public.quiz_attempts') IS NOT NULL THEN
    parts := array_append(parts, 'SELECT user_id, taken_at AS ts FROM public.quiz_attempts');
  END IF;
  IF to_regclass('public.standalone_quiz_attempts') IS NOT NULL THEN
    parts := array_append(parts, 'SELECT user_id, taken_at AS ts FROM public.standalone_quiz_attempts');
  END IF;

  IF array_length(parts, 1) IS NULL THEN
    RETURN; -- no activity tables present
  END IF;

  union_sql := array_to_string(parts, ' UNION ALL ');

  EXECUTE format($f$
    UPDATE public.profiles p
    SET last_login = activity.last_active
    FROM (
      SELECT user_id, max(ts) AS last_active
      FROM ( %s ) a
      WHERE ts IS NOT NULL
      GROUP BY user_id
    ) activity
    WHERE p.id = activity.user_id AND p.last_login IS NULL
  $f$, union_sql);
END $$;
