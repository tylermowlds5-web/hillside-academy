-- ── Step 4b seed: Plant ID question bank on the pilot program ─────────────
-- Run manually in the Supabase SQL editor AFTER the Step 4b schema block.
-- Re-run safe (each group is guarded by a NOT EXISTS on its label).
--
-- Attaches a Plant ID question bank to the FIRST module (lowest sort_order)
-- of 'Plant Care Fundamentals — Level 1': 6 plant groups × 3 questions each
-- (name / when we trim / how we trim). Each attempt draws 4 random groups
-- (12 questions), pass mark 80%.
--
-- Images hotlink Wikimedia Commons for placeholder purposes — swap image_url
-- values for your own R2 photos whenever ready. Groups render fine with
-- image_url = NULL too.

DO $$
DECLARE
  req uuid;
  grp uuid;
BEGIN
  SELECT r.id INTO req
  FROM public.cert_requirements r
  JOIN public.cert_programs p ON p.id = r.program_id
  WHERE p.name = 'Plant Care Fundamentals — Level 1'
  ORDER BY r.sort_order ASC
  LIMIT 1;

  IF req IS NULL THEN
    RAISE EXCEPTION 'Pilot program/requirement not found — run seed-cert-pilot.sql first';
  END IF;

  UPDATE public.cert_requirements
  SET quiz_pass_score = 80, quiz_draw_count = 4
  WHERE id = req;

  -- ── Boxwood ──
  IF NOT EXISTS (SELECT 1 FROM public.cert_question_groups WHERE requirement_id = req AND label = 'Boxwood') THEN
    INSERT INTO public.cert_question_groups (requirement_id, label, image_url, sort_order)
    VALUES (req, 'Boxwood', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Buxus_sempervirens_shrub.jpg/640px-Buxus_sempervirens_shrub.jpg', 0)
    RETURNING id INTO grp;
    INSERT INTO public.cert_questions (group_id, question, sort_order) VALUES
    (grp, '{"type":"multiple_choice","question_text":"What plant is shown in the photo?","options":[{"option_text":"Boxwood","is_correct":true},{"option_text":"Privet","is_correct":false},{"option_text":"Holly","is_correct":false},{"option_text":"Euonymus","is_correct":false}]}', 0),
    (grp, '{"type":"multiple_choice","question_text":"When do we shear this plant?","options":[{"option_text":"Late spring after the first flush, then as needed through summer","is_correct":true},{"option_text":"Only in the middle of winter","is_correct":false},{"option_text":"During the hottest week of summer","is_correct":false},{"option_text":"Never — it is left natural","is_correct":false}]}', 1),
    (grp, '{"type":"multiple_choice","question_text":"How do we trim it?","options":[{"option_text":"Shear to shape, keeping the base slightly wider than the top","is_correct":true},{"option_text":"Cut it flush to the ground each visit","is_correct":false},{"option_text":"Top it flat and leave the sides untouched","is_correct":false},{"option_text":"Remove only the interior branches","is_correct":false}]}', 2);
  END IF;

  -- ── Japanese Maple ──
  IF NOT EXISTS (SELECT 1 FROM public.cert_question_groups WHERE requirement_id = req AND label = 'Japanese Maple') THEN
    INSERT INTO public.cert_question_groups (requirement_id, label, image_url, sort_order)
    VALUES (req, 'Japanese Maple', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Acer_palmatum_Bloodgood_JPG1.jpg/640px-Acer_palmatum_Bloodgood_JPG1.jpg', 1)
    RETURNING id INTO grp;
    INSERT INTO public.cert_questions (group_id, question, sort_order) VALUES
    (grp, '{"type":"multiple_choice","question_text":"What plant is shown in the photo?","options":[{"option_text":"Japanese Maple","is_correct":true},{"option_text":"Red Oak","is_correct":false},{"option_text":"Smoke Tree","is_correct":false},{"option_text":"Crape Myrtle","is_correct":false}]}', 0),
    (grp, '{"type":"multiple_choice","question_text":"When do we prune this plant?","options":[{"option_text":"Late winter while dormant, or lightly in summer","is_correct":true},{"option_text":"Right as spring growth is pushing","is_correct":false},{"option_text":"Weekly through the season","is_correct":false},{"option_text":"Only immediately after flowering","is_correct":false}]}', 1),
    (grp, '{"type":"multiple_choice","question_text":"How do we prune it?","options":[{"option_text":"Selective thinning cuts to keep its natural layered form — never sheared","is_correct":true},{"option_text":"Shear into a tight ball","is_correct":false},{"option_text":"Top it to control height","is_correct":false},{"option_text":"Strip the lower third of all branches","is_correct":false}]}', 2);
  END IF;

  -- ── Hydrangea ──
  IF NOT EXISTS (SELECT 1 FROM public.cert_question_groups WHERE requirement_id = req AND label = 'Hydrangea') THEN
    INSERT INTO public.cert_question_groups (requirement_id, label, image_url, sort_order)
    VALUES (req, 'Hydrangea', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Hydrangea_macrophylla_-_Bigleaf_hydrangea.jpg/640px-Hydrangea_macrophylla_-_Bigleaf_hydrangea.jpg', 2)
    RETURNING id INTO grp;
    INSERT INTO public.cert_questions (group_id, question, sort_order) VALUES
    (grp, '{"type":"multiple_choice","question_text":"What plant is shown in the photo?","options":[{"option_text":"Hydrangea","is_correct":true},{"option_text":"Viburnum","is_correct":false},{"option_text":"Peony","is_correct":false},{"option_text":"Azalea","is_correct":false}]}', 0),
    (grp, '{"type":"multiple_choice","question_text":"When do we prune this plant?","options":[{"option_text":"Right after it finishes blooming — old wood carries next year''s flowers","is_correct":true},{"option_text":"Any time — timing never affects bloom","is_correct":false},{"option_text":"Late fall, cutting to the ground","is_correct":false},{"option_text":"Early spring before growth starts, hard","is_correct":false}]}', 1),
    (grp, '{"type":"multiple_choice","question_text":"How do we prune it?","options":[{"option_text":"Deadhead spent blooms and thin weak or crossing stems at the base","is_correct":true},{"option_text":"Shear all stems to a uniform height","is_correct":false},{"option_text":"Remove all stems that flowered this year to the ground","is_correct":false},{"option_text":"Cut everything back by two-thirds each visit","is_correct":false}]}', 2);
  END IF;

  -- ── Lavender ──
  IF NOT EXISTS (SELECT 1 FROM public.cert_question_groups WHERE requirement_id = req AND label = 'Lavender') THEN
    INSERT INTO public.cert_question_groups (requirement_id, label, image_url, sort_order)
    VALUES (req, 'Lavender', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Single_lavender_flower02.jpg/640px-Single_lavender_flower02.jpg', 3)
    RETURNING id INTO grp;
    INSERT INTO public.cert_questions (group_id, question, sort_order) VALUES
    (grp, '{"type":"multiple_choice","question_text":"What plant is shown in the photo?","options":[{"option_text":"Lavender","is_correct":true},{"option_text":"Russian Sage","is_correct":false},{"option_text":"Catmint","is_correct":false},{"option_text":"Salvia","is_correct":false}]}', 0),
    (grp, '{"type":"multiple_choice","question_text":"When do we cut this plant back?","options":[{"option_text":"After summer bloom, and shape again in early spring","is_correct":true},{"option_text":"Mid-winter, hard into old wood","is_correct":false},{"option_text":"Never — lavender resents any pruning","is_correct":false},{"option_text":"Weekly during bloom","is_correct":false}]}', 1),
    (grp, '{"type":"multiple_choice","question_text":"How do we cut it back?","options":[{"option_text":"Shear the top third, staying in green growth — never cut into bare old wood","is_correct":true},{"option_text":"Cut flush to the soil line","is_correct":false},{"option_text":"Remove only the flower spikes, never the foliage","is_correct":false},{"option_text":"Thin half the stems to the ground each year","is_correct":false}]}', 2);
  END IF;

  -- ── Photinia ──
  IF NOT EXISTS (SELECT 1 FROM public.cert_question_groups WHERE requirement_id = req AND label = 'Photinia') THEN
    INSERT INTO public.cert_question_groups (requirement_id, label, image_url, sort_order)
    VALUES (req, 'Photinia', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Photinia_fraseri_1.jpg/640px-Photinia_fraseri_1.jpg', 4)
    RETURNING id INTO grp;
    INSERT INTO public.cert_questions (group_id, question, sort_order) VALUES
    (grp, '{"type":"multiple_choice","question_text":"What plant is shown in the photo?","options":[{"option_text":"Photinia (Red Tip)","is_correct":true},{"option_text":"Camellia","is_correct":false},{"option_text":"Cherry Laurel","is_correct":false},{"option_text":"Loquat","is_correct":false}]}', 0),
    (grp, '{"type":"multiple_choice","question_text":"When do we trim this plant?","options":[{"option_text":"After the red spring flush hardens off, repeating as flushes fade","is_correct":true},{"option_text":"Only in the dead of winter","is_correct":false},{"option_text":"While the new growth is still bright red and soft","is_correct":false},{"option_text":"Once every few years","is_correct":false}]}', 1),
    (grp, '{"type":"multiple_choice","question_text":"How do we trim it?","options":[{"option_text":"Shear for hedges or selectively head back for screens, keeping air moving through the canopy","is_correct":true},{"option_text":"Top it flat regardless of use","is_correct":false},{"option_text":"Strip all interior growth","is_correct":false},{"option_text":"Cut to the ground annually","is_correct":false}]}', 2);
  END IF;

  -- ── Rosemary ──
  IF NOT EXISTS (SELECT 1 FROM public.cert_question_groups WHERE requirement_id = req AND label = 'Rosemary') THEN
    INSERT INTO public.cert_question_groups (requirement_id, label, image_url, sort_order)
    VALUES (req, 'Rosemary', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Rosmarinus_officinalis133095382.jpg/640px-Rosmarinus_officinalis133095382.jpg', 5)
    RETURNING id INTO grp;
    INSERT INTO public.cert_questions (group_id, question, sort_order) VALUES
    (grp, '{"type":"multiple_choice","question_text":"What plant is shown in the photo?","options":[{"option_text":"Rosemary","is_correct":true},{"option_text":"Rockrose","is_correct":false},{"option_text":"Juniper","is_correct":false},{"option_text":"Westringia","is_correct":false}]}', 0),
    (grp, '{"type":"multiple_choice","question_text":"When do we trim this plant?","options":[{"option_text":"Lightly after flowering in spring, with touch-ups through the growing season","is_correct":true},{"option_text":"Hard in late fall before frost","is_correct":false},{"option_text":"Only when it becomes woody and bare","is_correct":false},{"option_text":"Monthly, regardless of season","is_correct":false}]}', 1),
    (grp, '{"type":"multiple_choice","question_text":"How do we trim it?","options":[{"option_text":"Tip-prune green growth to shape — like lavender, avoid cutting into bare old wood","is_correct":true},{"option_text":"Shear deep into the woody center for density","is_correct":false},{"option_text":"Remove entire branches at the trunk only","is_correct":false},{"option_text":"Mow it flat with the hedge trimmer each visit","is_correct":false}]}', 2);
  END IF;
END $$;
