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

-- ── is_admin() helper ─────────────────────────────────────────────────────
-- True when the calling session belongs to a profile with role = 'admin'.
-- SECURITY DEFINER so the profiles lookup works even if profiles ever gets
-- restrictive RLS of its own. Used by RLS policies below — every admin page
-- and server action queries through the admin's OWN session (not the service
-- role), so policies must grant admins access explicitly.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 5. RLS policies (adjust as needed for your existing RLS setup)
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- NOTE: CREATE POLICY has no IF NOT EXISTS clause in PostgreSQL, so we use
-- DROP POLICY IF EXISTS + CREATE POLICY to keep this file re-run safe.

-- Allow authenticated users to read quizzes
DROP POLICY IF EXISTS "quizzes_read" ON public.quizzes;
CREATE POLICY "quizzes_read" ON public.quizzes
  FOR SELECT TO authenticated USING (true);

-- Admins create/update/delete quizzes. saveQuiz and deleteQuiz run under the
-- admin's own session client, so without this policy enabling RLS would
-- silently break quiz editing.
DROP POLICY IF EXISTS "quizzes_admin_write" ON public.quizzes;
CREATE POLICY "quizzes_admin_write" ON public.quizzes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Allow authenticated users to insert their own attempts
DROP POLICY IF EXISTS "quiz_attempts_insert" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_insert" ON public.quiz_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users read their own attempts; admins read everyone's (Progress Report,
-- Quiz Insights, employee detail, and CSV export all query quiz_attempts
-- through the admin's session client). Attempt deletion needs no policy:
-- rows only ever go away via the quiz_id FK cascade, and referential
-- actions bypass RLS.
DROP POLICY IF EXISTS "quiz_attempts_read" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_read" ON public.quiz_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

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

-- ── Step 2: Certifications ────────────────────────────────────────────────
-- Purely additive: three new cert_* tables, their indexes, and their RLS.
-- Touches ZERO existing tables — no ALTER TABLE, no data changes.
--
-- Model: a cert program is a named credential (e.g. "Irrigation Basics")
-- made up of requirements. Each requirement is exactly ONE of: a video
-- (complete + pass its quiz if it has one), a standalone quiz (pass), or a
-- learning path (complete). When an employee satisfies every requirement
-- they get a row in cert_awards; validity_months controls expiry
-- (null = never expires). Renewal updates the existing award row —
-- one row per (program, user), not a history table.

CREATE TABLE IF NOT EXISTS public.cert_programs (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  -- How long an award stays valid, in months. NULL = never expires.
  validity_months integer,
  -- Inactive programs are hidden from employees but keep their awards.
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.cert_requirements (
  id uuid default gen_random_uuid() primary key,
  program_id uuid not null references public.cert_programs(id) on delete cascade,
  -- Exactly one of the three targets is set (enforced by CHECK below).
  -- ON DELETE CASCADE: deleting a video/quiz/path removes the requirement so
  -- programs never point at ghosts (same policy as assignments/progress).
  video_id uuid references public.videos(id) on delete cascade,
  standalone_quiz_id uuid references public.standalone_quizzes(id) on delete cascade,
  path_id uuid references public.learning_paths(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now(),
  CONSTRAINT cert_requirements_one_target CHECK (
    (video_id IS NOT NULL)::int
    + (standalone_quiz_id IS NOT NULL)::int
    + (path_id IS NOT NULL)::int = 1
  ),
  -- Per-target uniqueness (NULLs don't collide, so each line only bites for
  -- rows of its own target type).
  UNIQUE (program_id, video_id),
  UNIQUE (program_id, standalone_quiz_id),
  UNIQUE (program_id, path_id)
);

CREATE TABLE IF NOT EXISTS public.cert_awards (
  id uuid default gen_random_uuid() primary key,
  program_id uuid not null references public.cert_programs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- NULL = auto-awarded by the app on requirement completion.
  awarded_by uuid references auth.users(id) on delete set null,
  earned_at timestamp with time zone not null default now(),
  -- NULL = never expires (program had no validity_months at award time).
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid references auth.users(id) on delete set null,
  UNIQUE (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS cert_requirements_program_idx ON public.cert_requirements (program_id);
CREATE INDEX IF NOT EXISTS cert_awards_user_idx ON public.cert_awards (user_id);
CREATE INDEX IF NOT EXISTS cert_awards_program_idx ON public.cert_awards (program_id);

ALTER TABLE public.cert_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_awards ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can see programs + requirements (employees need them to
-- see what a cert takes); only admins manage them.
DROP POLICY IF EXISTS "cert_programs_read" ON public.cert_programs;
CREATE POLICY "cert_programs_read" ON public.cert_programs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cert_programs_admin_write" ON public.cert_programs;
CREATE POLICY "cert_programs_admin_write" ON public.cert_programs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cert_requirements_read" ON public.cert_requirements;
CREATE POLICY "cert_requirements_read" ON public.cert_requirements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cert_requirements_admin_write" ON public.cert_requirements;
CREATE POLICY "cert_requirements_admin_write" ON public.cert_requirements
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Awards: employees see their own, admins see (and manage) everyone's.
-- Auto-awarding from an employee action must go through the service-role
-- client (employees can't insert their own awards by design).
DROP POLICY IF EXISTS "cert_awards_read" ON public.cert_awards;
CREATE POLICY "cert_awards_read" ON public.cert_awards
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "cert_awards_admin_write" ON public.cert_awards;
CREATE POLICY "cert_awards_admin_write" ON public.cert_awards
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Step 4b: Cert lessons, question bank, and quiz attempts ───────────────
-- Cert progress is SELF-CONTAINED: watching a video in everyday HU does NOT
-- count toward a certification. Cert watch state lives in its own table
-- (cert_lesson_progress) keyed on the cert requirement, never on the shared
-- progress table.

-- Per-module quiz settings. quiz_draw_count = how many question GROUPS are
-- randomly drawn per attempt (a group = one plant photo + its questions).
ALTER TABLE public.cert_requirements
  ADD COLUMN IF NOT EXISTS quiz_pass_score integer not null default 80,
  ADD COLUMN IF NOT EXISTS quiz_draw_count integer not null default 4;

-- Watch state for a cert video module. Mirrors the shape of `progress` but is
-- deliberately independent of it.
CREATE TABLE IF NOT EXISTS public.cert_lesson_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requirement_id uuid not null references public.cert_requirements(id) on delete cascade,
  percent_watched integer not null default 0,
  actual_seconds_watched integer not null default 0,
  completed boolean not null default false,
  last_watched_at timestamp with time zone default now(),
  UNIQUE (user_id, requirement_id)
);

-- Question bank. A group is one shared stimulus (e.g. a plant photo) with its
-- linked questions beneath (name / when we trim / how we trim), each scored
-- separately. `label` is admin-facing only (it usually names the plant, i.e.
-- the answer) and must never be sent to employees.
CREATE TABLE IF NOT EXISTS public.cert_question_groups (
  id uuid default gen_random_uuid() primary key,
  requirement_id uuid not null references public.cert_requirements(id) on delete cascade,
  label text,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now()
);

-- Individual questions, one row each, in the same JSONB shape as everyday HU
-- quiz questions so lib/quiz-scoring is reused unchanged.
CREATE TABLE IF NOT EXISTS public.cert_questions (
  id uuid default gen_random_uuid() primary key,
  group_id uuid not null references public.cert_question_groups(id) on delete cascade,
  question jsonb not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now()
);

-- One row per attempt. `questions` is the full snapshot of what was served —
-- which groups were drawn and the exact shuffled option order — INCLUDING the
-- answer key, so history survives bank edits and retakes draw fresh. Because
-- the key is in the row, employees get NO direct read access (see RLS below);
-- all employee interaction goes through server actions using the service
-- role after auth + gate checks.
CREATE TABLE IF NOT EXISTS public.cert_quiz_attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requirement_id uuid not null references public.cert_requirements(id) on delete cascade,
  questions jsonb not null,
  answers jsonb,
  score integer,
  passed boolean,
  started_at timestamp with time zone default now(),
  submitted_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS cert_lesson_progress_req_idx ON public.cert_lesson_progress (requirement_id);
CREATE INDEX IF NOT EXISTS cert_question_groups_req_idx ON public.cert_question_groups (requirement_id);
CREATE INDEX IF NOT EXISTS cert_questions_group_idx ON public.cert_questions (group_id);
CREATE INDEX IF NOT EXISTS cert_quiz_attempts_user_req_idx ON public.cert_quiz_attempts (user_id, requirement_id);

ALTER TABLE public.cert_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_question_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Lesson progress: users manage their own rows; admins read everything.
DROP POLICY IF EXISTS "cert_lesson_progress_read" ON public.cert_lesson_progress;
CREATE POLICY "cert_lesson_progress_read" ON public.cert_lesson_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "cert_lesson_progress_insert" ON public.cert_lesson_progress;
CREATE POLICY "cert_lesson_progress_insert" ON public.cert_lesson_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cert_lesson_progress_update" ON public.cert_lesson_progress;
CREATE POLICY "cert_lesson_progress_update" ON public.cert_lesson_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cert_lesson_progress_admin" ON public.cert_lesson_progress;
CREATE POLICY "cert_lesson_progress_admin" ON public.cert_lesson_progress
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Question bank + attempts hold the answer key → admin-only. Employees never
-- read these tables directly (not even their own attempt rows, which contain
-- the served key); the app serves sanitized data via server actions.
DROP POLICY IF EXISTS "cert_question_groups_admin" ON public.cert_question_groups;
CREATE POLICY "cert_question_groups_admin" ON public.cert_question_groups
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cert_questions_admin" ON public.cert_questions;
CREATE POLICY "cert_questions_admin" ON public.cert_questions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cert_quiz_attempts_admin" ON public.cert_quiz_attempts;
CREATE POLICY "cert_quiz_attempts_admin" ON public.cert_quiz_attempts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Step 5: Text/image lessons + cert enrollment ──────────────────────────

-- A module can now be a TEXT LESSON (title + body + optional image) instead
-- of pointing at a video/quiz/path. Completed via "Mark as read" (a
-- cert_lesson_progress row), then its question bank if it has one.
ALTER TABLE public.cert_requirements
  ADD COLUMN IF NOT EXISTS lesson_title text,
  ADD COLUMN IF NOT EXISTS lesson_body text,
  ADD COLUMN IF NOT EXISTS lesson_image_url text;

-- Widen the one-target rule: exactly ONE of video / standalone quiz / path /
-- text lesson per requirement.
ALTER TABLE public.cert_requirements DROP CONSTRAINT IF EXISTS cert_requirements_one_target;
ALTER TABLE public.cert_requirements ADD CONSTRAINT cert_requirements_one_target CHECK (
  (video_id IS NOT NULL)::int
  + (standalone_quiz_id IS NOT NULL)::int
  + (path_id IS NOT NULL)::int
  + (lesson_title IS NOT NULL)::int = 1
);

-- Enrollment: which employees a cert is assigned to. Assignment is
-- informational (badge/ordering) — active programs remain visible to all.
CREATE TABLE IF NOT EXISTS public.cert_assignments (
  id uuid default gen_random_uuid() primary key,
  program_id uuid not null references public.cert_programs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamp with time zone default now(),
  UNIQUE (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS cert_assignments_user_idx ON public.cert_assignments (user_id);

ALTER TABLE public.cert_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cert_assignments_read" ON public.cert_assignments;
CREATE POLICY "cert_assignments_read" ON public.cert_assignments
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "cert_assignments_admin" ON public.cert_assignments;
CREATE POLICY "cert_assignments_admin" ON public.cert_assignments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Step 6: Standalone bank questions ─────────────────────────────────────
-- A cert question now belongs EITHER to a photo group (group_id) OR directly
-- to the module (requirement_id) as a standalone question of any type. A
-- drawable unit in startCertQuizAttempt is one group (all its linked
-- questions) or one standalone question; quiz_draw_count counts units.
-- RLS is unchanged — the table stays admin-only.
ALTER TABLE public.cert_questions
  ADD COLUMN IF NOT EXISTS requirement_id uuid references public.cert_requirements(id) on delete cascade;

ALTER TABLE public.cert_questions ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE public.cert_questions DROP CONSTRAINT IF EXISTS cert_questions_one_parent;
ALTER TABLE public.cert_questions ADD CONSTRAINT cert_questions_one_parent CHECK (
  (group_id IS NOT NULL)::int + (requirement_id IS NOT NULL)::int = 1
);

CREATE INDEX IF NOT EXISTS cert_questions_req_idx ON public.cert_questions (requirement_id);

-- ── Step 7: Expiration & renewal ──────────────────────────────────────────

-- New programs default to a 12-month validity (existing rows untouched;
-- NULL still means the credential never expires).
ALTER TABLE public.cert_programs ALTER COLUMN validity_months SET DEFAULT 12;

-- Renewal cycle marker. Starting a renewal wipes the user's
-- cert_lesson_progress for the program and stamps this; quiz attempts only
-- count toward completion when submitted AFTER it, so re-certifying
-- requires re-taking the whole course. A cycle is "open" while
-- renewal_started_at > earned_at; completing every module again updates
-- earned_at/expires_at, closing the cycle.
ALTER TABLE public.cert_awards
  ADD COLUMN IF NOT EXISTS renewal_started_at timestamp with time zone;
