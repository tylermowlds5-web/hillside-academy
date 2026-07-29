-- ── Step 4a seed: one pilot certification program ─────────────────────────
-- Run manually in the Supabase SQL editor. Re-run safe.
--
-- Creates "Plant Care Fundamentals — Level 1" and wires its modules to REAL
-- rows that already exist in the live DB:
--   · up to 4 existing videos, preferring plant-related categories, falling
--     back to the oldest videos (so the program always has content)
--   · the earliest standalone quiz as a final "certification quiz" module,
--     IF any standalone quiz exists (skipped silently otherwise)
--
-- Purely additive: inserts into cert_programs / cert_requirements only.
-- Nothing existing is altered. Delete the program row to remove the pilot —
-- its requirements cascade.

WITH prog AS (
  INSERT INTO public.cert_programs (name, description, validity_months, is_active)
  VALUES (
    'Plant Care Fundamentals — Level 1',
    'Pilot certification program. Work through each module in order — every video must be fully watched (and its quiz passed, if it has one) before the next module unlocks. Question bank and certification exam arrive in Step 4b.',
    24,
    true
  )
  ON CONFLICT (name) DO UPDATE SET is_active = true
  RETURNING id
),
picked_videos AS (
  SELECT v.id,
         row_number() OVER (
           ORDER BY (coalesce(v.category, '') ILIKE '%plant%') DESC, v.created_at ASC
         ) - 1 AS ord
  FROM public.videos v
  ORDER BY (coalesce(v.category, '') ILIKE '%plant%') DESC, v.created_at ASC
  LIMIT 4
),
video_reqs AS (
  INSERT INTO public.cert_requirements (program_id, video_id, sort_order)
  SELECT prog.id, picked_videos.id, picked_videos.ord
  FROM prog, picked_videos
  ON CONFLICT (program_id, video_id) DO NOTHING
  RETURNING id
)
INSERT INTO public.cert_requirements (program_id, standalone_quiz_id, sort_order)
SELECT prog.id, q.id, 99
FROM prog,
     LATERAL (
       SELECT id FROM public.standalone_quizzes ORDER BY created_at ASC LIMIT 1
     ) q
ON CONFLICT (program_id, standalone_quiz_id) DO NOTHING;
