-- Run this in your Supabase SQL editor
-- Re-run safe — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING

-- Deactivate users without deleting their data
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Track whether the employee has passed the quiz for each video.
-- Kept in sync with quiz_attempts by submitQuizAttempt.
ALTER TABLE public.progress
  ADD COLUMN IF NOT EXISTS quiz_passed boolean NOT NULL DEFAULT false;

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
