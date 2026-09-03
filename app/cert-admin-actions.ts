'use server'

// Admin server actions for the certification builder (/certs/admin).
// All actions are admin-gated; the cert_* RLS policies grant admins full
// access through their own session client, so no service role is needed.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PageBlock, PlantData, QuizQuestion } from '@/lib/types'
import { parsePlantObject } from '@/lib/plant-import'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return { supabase, user }
}

// ── Programs ──────────────────────────────────────────────────────────────

export async function saveCertProgram(input: {
  programId?: string
  name: string
  description: string
  validityMonths: number | null
  isActive: boolean
}): Promise<{ id: string }> {
  const { supabase, user } = await requireAdmin()
  const name = input.name.trim()
  if (!name) throw new Error('Program name is required')

  const row = {
    name,
    description: input.description.trim() || null,
    validity_months: input.validityMonths,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  }

  if (input.programId) {
    const { error } = await supabase.from('cert_programs').update(row).eq('id', input.programId)
    if (error) throw new Error(error.message)
    return { id: input.programId }
  }

  const { data, error } = await supabase
    .from('cert_programs')
    .insert({ ...row, created_by: user.id })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Create failed')
  return { id: data.id }
}

export async function deleteCertProgram(programId: string) {
  const { supabase } = await requireAdmin()
  // Modules that live ONLY in this program go with it (their banks, pages,
  // attempts, and progress cascade). Modules shared with other programs are
  // just unlinked (the link rows cascade from the program row).
  const { data: mine } = await supabase
    .from('cert_program_modules')
    .select('module_id')
    .eq('program_id', programId)
    .returns<{ module_id: string }[]>()
  const moduleIds = (mine ?? []).map((m) => m.module_id)
  if (moduleIds.length > 0) {
    const { data: elsewhere } = await supabase
      .from('cert_program_modules')
      .select('module_id')
      .in('module_id', moduleIds)
      .neq('program_id', programId)
      .returns<{ module_id: string }[]>()
    const shared = new Set((elsewhere ?? []).map((m) => m.module_id))
    const exclusive = moduleIds.filter((id) => !shared.has(id))
    if (exclusive.length > 0) {
      const { error } = await supabase.from('cert_requirements').delete().in('id', exclusive)
      if (error) throw new Error(error.message)
    }
  }
  // Links, assignments, and awards cascade from the program row.
  const { error } = await supabase.from('cert_programs').delete().eq('id', programId)
  if (error) throw new Error(error.message)
}

// Next free position at the end of a program's module list.
async function nextModulePosition(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  programId: string
): Promise<number> {
  const { data } = await supabase
    .from('cert_program_modules')
    .select('position')
    .eq('program_id', programId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>()
  return (data?.position ?? -1) + 1
}

// ── Modules (requirements) ────────────────────────────────────────────────

export async function addCertModule(
  programId: string,
  target: { kind: 'video'; videoId: string } | { kind: 'lesson'; title: string }
): Promise<{ id: string }> {
  const { supabase } = await requireAdmin()
  const position = await nextModulePosition(supabase, programId)

  // program_id = home program (informational). Membership is the link row,
  // written explicitly below (the DB trigger would add it too; the upsert
  // makes the position authoritative either way).
  const row =
    target.kind === 'video'
      ? { program_id: programId, video_id: target.videoId, sort_order: position }
      : { program_id: programId, lesson_title: target.title.trim() || 'New lesson', sort_order: position }

  const { data, error } = await supabase
    .from('cert_requirements')
    .insert(row)
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Add module failed')

  const { error: linkError } = await supabase
    .from('cert_program_modules')
    .upsert({ program_id: programId, module_id: data.id, position }, { onConflict: 'program_id,module_id' })
  if (linkError) throw new Error(linkError.message)
  return { id: data.id }
}

// Removes a module FROM THIS PROGRAM. If no other program still contains it,
// the module row is deleted too (bank groups/questions, pages, attempts, and
// lesson progress cascade). A module shared elsewhere is only unlinked —
// its content and every employee's progress on it stay intact.
export async function removeCertModule(programId: string, requirementId: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('cert_program_modules')
    .delete()
    .eq('program_id', programId)
    .eq('module_id', requirementId)
  if (error) throw new Error(error.message)

  const { count } = await supabase
    .from('cert_program_modules')
    .select('module_id', { count: 'exact', head: true })
    .eq('module_id', requirementId)
  if ((count ?? 0) === 0) {
    const { error: delError } = await supabase.from('cert_requirements').delete().eq('id', requirementId)
    if (delError) throw new Error(delError.message)
  }
}

export async function reorderCertModules(programId: string, orderedIds: string[]) {
  const { supabase } = await requireAdmin()
  // Order is per program (the link's position); scoped so a stale id from
  // another program can't be moved.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('cert_program_modules')
      .update({ position: i })
      .eq('program_id', programId)
      .eq('module_id', orderedIds[i])
    if (error) throw new Error(error.message)
  }
}

// "Add existing module": links a module that already lives in another
// program into this one, at the end. Same rows, not a copy — lessons, pages,
// plant pages, and quiz questions are shared, and each employee's progress
// on the module counts here too.
export async function addExistingCertModule(programId: string, moduleId: string) {
  const { supabase } = await requireAdmin()

  const { data: existing } = await supabase
    .from('cert_program_modules')
    .select('module_id')
    .eq('program_id', programId)
    .eq('module_id', moduleId)
    .maybeSingle<{ module_id: string }>()
  if (existing) throw new Error('That module is already in this program')

  const { data: mod } = await supabase
    .from('cert_requirements')
    .select('id')
    .eq('id', moduleId)
    .maybeSingle<{ id: string }>()
  if (!mod) throw new Error('Module not found')

  const position = await nextModulePosition(supabase, programId)
  const { error } = await supabase
    .from('cert_program_modules')
    .insert({ program_id: programId, module_id: moduleId, position })
  if (error) throw new Error(error.message)
}

// "Duplicate module": an INDEPENDENT copy — new module row (home = this
// program) with copies of its categories, pages, question groups, and
// questions, linked at the end of this program. Employee progress and
// attempts are not copied (they belong to the original).
export async function duplicateCertModule(programId: string, moduleId: string): Promise<{ id: string }> {
  const { supabase } = await requireAdmin()

  const { data: src } = await supabase
    .from('cert_requirements')
    .select('*')
    .eq('id', moduleId)
    .maybeSingle<Record<string, unknown>>()
  if (!src) throw new Error('Module not found')

  const position = await nextModulePosition(supabase, programId)
  // Copy every column except identity ones so new columns are carried along.
  const strip = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id' && k !== 'created_at'))
  const copyRow: Record<string, unknown> = { ...strip(src), program_id: programId, sort_order: position }
  if (typeof copyRow.lesson_title === 'string') copyRow.lesson_title = `${copyRow.lesson_title} (copy)`

  const { data: copy, error } = await supabase
    .from('cert_requirements')
    .insert(copyRow)
    .select('id')
    .single<{ id: string }>()
  if (error || !copy) throw new Error(error?.message ?? 'Duplicate failed')
  const newId = copy.id

  // The insert trigger links the copy at sort_order; make position explicit.
  const { error: linkError } = await supabase
    .from('cert_program_modules')
    .upsert({ program_id: programId, module_id: newId, position }, { onConflict: 'program_id,module_id' })
  if (linkError) throw new Error(linkError.message)

  // Categories first so pages / bank units can be remapped onto the copies.
  const categoryMap = new Map<string, string>()
  const { data: cats } = await supabase
    .from('cert_categories')
    .select('*')
    .eq('requirement_id', moduleId)
    .order('sort_order')
    .returns<Record<string, unknown>[]>()
  for (const cat of cats ?? []) {
    const { data: newCat, error: catErr } = await supabase
      .from('cert_categories')
      .insert({ ...strip(cat), requirement_id: newId })
      .select('id')
      .single<{ id: string }>()
    if (catErr || !newCat) throw new Error(catErr?.message ?? 'Duplicate failed (categories)')
    categoryMap.set(cat.id as string, newCat.id)
  }
  const remapCategory = (row: Record<string, unknown>) => ({
    ...row,
    category_id: row.category_id ? (categoryMap.get(row.category_id as string) ?? null) : null,
  })

  const { data: pages } = await supabase
    .from('cert_pages')
    .select('*')
    .eq('requirement_id', moduleId)
    .order('sort_order')
    .returns<Record<string, unknown>[]>()
  if ((pages ?? []).length > 0) {
    const { error: pErr } = await supabase
      .from('cert_pages')
      .insert((pages ?? []).map((p) => ({ ...remapCategory(strip(p)), requirement_id: newId })))
    if (pErr) throw new Error(pErr.message)
  }

  const { data: groups } = await supabase
    .from('cert_question_groups')
    .select('*, cert_questions ( * )')
    .eq('requirement_id', moduleId)
    .order('sort_order')
    .returns<(Record<string, unknown> & { cert_questions: Record<string, unknown>[] })[]>()
  for (const g of groups ?? []) {
    const { cert_questions: qs, ...groupRow } = g
    const { data: newGroup, error: gErr } = await supabase
      .from('cert_question_groups')
      .insert({ ...remapCategory(strip(groupRow)), requirement_id: newId })
      .select('id')
      .single<{ id: string }>()
    if (gErr || !newGroup) throw new Error(gErr?.message ?? 'Duplicate failed (question groups)')
    if (qs.length > 0) {
      const { error: qErr } = await supabase
        .from('cert_questions')
        .insert(qs.map((q) => ({ ...remapCategory(strip(q)), group_id: newGroup.id, requirement_id: null })))
      if (qErr) throw new Error(qErr.message)
    }
  }

  const { data: standalone } = await supabase
    .from('cert_questions')
    .select('*')
    .eq('requirement_id', moduleId)
    .order('sort_order')
    .returns<Record<string, unknown>[]>()
  if ((standalone ?? []).length > 0) {
    const { error: sErr } = await supabase
      .from('cert_questions')
      .insert((standalone ?? []).map((q) => ({ ...remapCategory(strip(q)), requirement_id: newId, group_id: null })))
    if (sErr) throw new Error(sErr.message)
  }

  return { id: newId }
}

export async function updateCertModule(
  requirementId: string,
  input: {
    passScore: number
    drawCount: number
    lessonTitle?: string
    lessonBody?: string
    lessonImageUrl?: string | null
  }
) {
  const { supabase } = await requireAdmin()

  const row: Record<string, unknown> = {
    quiz_pass_score: Math.min(100, Math.max(1, Math.round(input.passScore))),
    quiz_draw_count: Math.max(1, Math.round(input.drawCount)),
  }
  // Lesson content fields only apply to lesson modules; only touch them when
  // the caller sends them so video modules never gain a lesson_title (which
  // would violate the one-target CHECK).
  if (input.lessonTitle !== undefined) {
    const title = input.lessonTitle.trim()
    if (!title) throw new Error('Lesson title is required')
    row.lesson_title = title
    row.lesson_body = (input.lessonBody ?? '').trim() || null
    row.lesson_image_url = input.lessonImageUrl || null
  }

  const { error } = await supabase.from('cert_requirements').update(row).eq('id', requirementId)
  if (error) throw new Error(error.message)
}

// ── Lesson pages ──────────────────────────────────────────────────────────

// Conservative server-side scrub of admin-authored rich HTML before storage:
// strips script/style/iframe-type blocks, inline event handlers, and
// javascript: URLs. Authors are admins (RLS), so this is defense in depth,
// not a hostile-input boundary.
function sanitizeRichText(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '')
}

export async function addCertPage(
  requirementId: string,
  target:
    | { kind: 'video'; videoId: string }
    | { kind: 'text'; title: string }
    | { kind: 'plant'; commonName: string }
): Promise<{ id: string }> {
  const { supabase } = await requireAdmin()

  const { data: maxRow } = await supabase
    .from('cert_pages')
    .select('sort_order')
    .eq('requirement_id', requirementId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()
  const nextOrder = (maxRow?.sort_order ?? -1) + 1

  const row =
    target.kind === 'video'
      ? { requirement_id: requirementId, kind: 'video', video_id: target.videoId, sort_order: nextOrder }
      : target.kind === 'plant'
        ? {
            requirement_id: requirementId,
            kind: 'plant',
            // title mirrors common_name so listings/tooltips work everywhere.
            title: target.commonName.trim() || 'New plant',
            plant_data: { common_name: target.commonName.trim() || 'New plant' },
            sort_order: nextOrder,
          }
        : { requirement_id: requirementId, kind: 'text', title: target.title.trim() || 'New page', sort_order: nextOrder }

  const { data, error } = await supabase
    .from('cert_pages')
    .insert(row)
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Add page failed')
  return { id: data.id }
}

// Saves a text page's block content (Step 12). Rich-HTML blocks get the
// same server-side scrub as the legacy body; all other block strings render
// as plain text (only **bold** honored), so they need no scrub. The legacy
// body/image columns are left untouched — a page with blocks ignores them.
export async function saveCertTextPage(
  pageId: string,
  input: { title: string; blocks: PageBlock[] }
) {
  const { supabase } = await requireAdmin()

  const blocks: PageBlock[] = input.blocks.map((b) =>
    b.type === 'richtext' ? { ...b, html: sanitizeRichText(b.html) } : b
  )

  const { error } = await supabase
    .from('cert_pages')
    .update({
      title: input.title.trim() || null,
      blocks,
    })
    .eq('id', pageId)
    .eq('kind', 'text')
  if (error) throw new Error(error.message)
}

// Saves a plant page's structured content. plant_data strings render as
// plain text (only **bold** is honored, and React escapes the rest), so no
// HTML scrub is needed here.
export async function updateCertPlantPage(pageId: string, data: PlantData) {
  const { supabase } = await requireAdmin()
  const commonName = data.common_name?.trim()
  if (!commonName) throw new Error('Plant name is required')

  const { error } = await supabase
    .from('cert_pages')
    .update({
      plant_data: { ...data, common_name: commonName },
      // title mirrors common_name so listings/tooltips work everywhere.
      title: commonName,
      // Saving from the form IS the review — the draft goes live.
      needs_review: false,
    })
    .eq('id', pageId)
    .eq('kind', 'plant')
  if (error) throw new Error(error.message)
}

// "Mark reviewed" on a list row: the admin looked at a flagged draft and it
// needs no changes. Publishes it to employees without touching content.
export async function markCertPageReviewed(pageId: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('cert_pages')
    .update({ needs_review: false })
    .eq('id', pageId)
  if (error) throw new Error(error.message)
}

// Bulk import: one plant page per entry, appended in order after the
// lesson's existing pages, every one flagged needs_review so nothing goes
// live until an admin looks at it. All-or-nothing: the client already ran
// the validator, but it's re-run here and any problem aborts the whole
// batch before a single row is written.
export async function bulkAddCertPlantPages(
  requirementId: string,
  plants: unknown[]
): Promise<{ ids: string[] }> {
  const { supabase } = await requireAdmin()
  if (plants.length === 0) throw new Error('Nothing to import')

  const parsed = plants.map((raw, i) => ({ i, ...parsePlantObject(raw) }))
  const failures = parsed.filter((p) => p.problems.length > 0)
  if (failures.length > 0) {
    const first = failures[0]
    throw new Error(
      `Entry ${first.i + 1}${first.data.common_name ? ` (${first.data.common_name})` : ''}: ${first.problems[0]}` +
        (failures.length > 1 ? ` — and ${failures.length - 1} more entr${failures.length === 2 ? 'y' : 'ies'} with problems` : '')
    )
  }

  // Confirm the target is a lesson module before appending.
  const { data: req } = await supabase
    .from('cert_requirements')
    .select('id, lesson_title')
    .eq('id', requirementId)
    .maybeSingle<{ id: string; lesson_title: string | null }>()
  if (!req?.lesson_title) throw new Error('Plant pages can only be added to a lesson module')

  const { data: maxRow } = await supabase
    .from('cert_pages')
    .select('sort_order')
    .eq('requirement_id', requirementId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()
  const start = (maxRow?.sort_order ?? -1) + 1

  const rows = parsed.map(({ data }, i) => {
    const commonName = data.common_name.trim()
    return {
      requirement_id: requirementId,
      kind: 'plant',
      title: commonName,
      plant_data: { ...data, common_name: commonName },
      sort_order: start + i,
      needs_review: true,
    }
  })

  const { data, error } = await supabase
    .from('cert_pages')
    .insert(rows)
    .select('id, sort_order')
    .returns<{ id: string; sort_order: number }[]>()
  if (error || !data) throw new Error(error?.message ?? 'Import failed')
  return { ids: data.slice().sort((a, b) => a.sort_order - b.sort_order).map((r) => r.id) }
}

export async function deleteCertPage(pageId: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('cert_pages').delete().eq('id', pageId)
  if (error) throw new Error(error.message)
}

export async function reorderCertPages(requirementId: string, orderedIds: string[]) {
  const { supabase } = await requireAdmin()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('cert_pages')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('requirement_id', requirementId)
    if (error) throw new Error(error.message)
  }
}

// ── Module categories ─────────────────────────────────────────────────────
// Sub-categories WITHIN a module, purely for organizing pages and bank
// units. They never affect page gating (flat cert_pages.sort_order stays
// the source of truth) or the quiz draw (always the whole bank).

export async function createCertCategory(
  requirementId: string,
  name: string
): Promise<{ id: string }> {
  const { supabase } = await requireAdmin()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required')

  const { data: maxRow } = await supabase
    .from('cert_categories')
    .select('sort_order')
    .eq('requirement_id', requirementId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()

  const { data, error } = await supabase
    .from('cert_categories')
    .insert({
      requirement_id: requirementId,
      name: trimmed,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) {
    if (error?.code === '23505') throw new Error('A category with that name already exists.')
    throw new Error(error?.message ?? 'Create category failed')
  }
  return { id: data.id }
}

export async function renameCertCategory(categoryId: string, name: string) {
  const { supabase } = await requireAdmin()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required')

  const { error } = await supabase
    .from('cert_categories')
    .update({ name: trimmed })
    .eq('id', categoryId)
  if (error) {
    if (error.code === '23505') throw new Error('A category with that name already exists.')
    throw new Error(error.message)
  }
}

export async function reorderCertCategories(requirementId: string, orderedIds: string[]) {
  const { supabase } = await requireAdmin()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('cert_categories')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('requirement_id', requirementId)
    if (error) throw new Error(error.message)
  }
}

// Deleting a category only uncategorizes its pages/groups/questions (FK
// ON DELETE SET NULL) — no content is ever deleted with it.
export async function deleteCertCategory(categoryId: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('cert_categories').delete().eq('id', categoryId)
  if (error) throw new Error(error.message)
}

export async function setCertPageCategory(pageId: string, categoryId: string | null) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('cert_pages')
    .update({ category_id: categoryId })
    .eq('id', pageId)
  if (error) throw new Error(error.message)
}

// ── Question bank ─────────────────────────────────────────────────────────

export async function saveCertGroup(input: {
  groupId?: string
  requirementId: string
  label: string
  imageUrl: string | null
  categoryId: string | null
}): Promise<{ id: string }> {
  const { supabase } = await requireAdmin()
  const row = {
    label: input.label.trim() || null,
    image_url: input.imageUrl,
    category_id: input.categoryId,
  }

  if (input.groupId) {
    const { error } = await supabase
      .from('cert_question_groups')
      .update(row)
      .eq('id', input.groupId)
    if (error) throw new Error(error.message)
    return { id: input.groupId }
  }

  const { data: maxRow } = await supabase
    .from('cert_question_groups')
    .select('sort_order')
    .eq('requirement_id', input.requirementId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()

  const { data, error } = await supabase
    .from('cert_question_groups')
    .insert({
      ...row,
      requirement_id: input.requirementId,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Create group failed')
  return { id: data.id }
}

export async function deleteCertGroup(groupId: string) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('cert_question_groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
}

// Replaces a group's questions wholesale. Safe: attempts snapshot the exact
// questions they served, so editing the bank never rewrites history.
export async function saveCertGroupQuestions(groupId: string, questions: QuizQuestion[]) {
  const { supabase } = await requireAdmin()

  const { error: delError } = await supabase
    .from('cert_questions')
    .delete()
    .eq('group_id', groupId)
  if (delError) throw new Error(delError.message)

  if (questions.length === 0) return

  const rows = questions.map((q, i) => ({ group_id: groupId, question: q, sort_order: i }))
  const { error } = await supabase.from('cert_questions').insert(rows)
  if (error) throw new Error(error.message)
}

// Replaces a module's STANDALONE questions (rows attached directly to the
// requirement, no photo group — each is its own drawable unit). Same
// wholesale-replace approach as groups; attempt snapshots keep history safe.
export async function saveCertStandaloneQuestions(
  requirementId: string,
  questions: { question: QuizQuestion; categoryId: string | null }[]
) {
  const { supabase } = await requireAdmin()

  // The delete below runs before the insert, so a stale categoryId (category
  // deleted in another tab since the editor loaded) must not FK-fail the
  // insert — that would lose the bank. Null out any id that no longer exists.
  const { data: validCategories } = await supabase
    .from('cert_categories')
    .select('id')
    .eq('requirement_id', requirementId)
    .returns<{ id: string }[]>()
  const validIds = new Set((validCategories ?? []).map((c) => c.id))

  const { error: delError } = await supabase
    .from('cert_questions')
    .delete()
    .eq('requirement_id', requirementId)
  if (delError) throw new Error(delError.message)

  if (questions.length === 0) return

  const rows = questions.map((q, i) => ({
    requirement_id: requirementId,
    question: q.question,
    category_id: q.categoryId && validIds.has(q.categoryId) ? q.categoryId : null,
    sort_order: i,
  }))
  const { error } = await supabase.from('cert_questions').insert(rows)
  if (error) throw new Error(error.message)
}

// ── Awards ────────────────────────────────────────────────────────────────

// Manual expiration override from the roster: extend, shorten, or clear
// (null = never expires / grandfathered). Touches ONLY expires_at — the
// earned_at pass record is never rewritten.
export async function setCertAwardExpiry(awardId: string, expiresAt: string | null) {
  const { supabase } = await requireAdmin()

  if (expiresAt !== null && isNaN(Date.parse(expiresAt))) {
    throw new Error('Invalid expiration date')
  }

  const { error } = await supabase
    .from('cert_awards')
    .update({ expires_at: expiresAt })
    .eq('id', awardId)
  if (error) throw new Error(error.message)
}

// Manual grant from the roster. Stamps awarded_by = the granting admin, so
// admin-granted certs stay distinguishable from earned-by-passing (which
// always has awarded_by null). Everywhere else it behaves like a real pass.
export async function grantCertAward(input: {
  userId: string
  programId: string
  earnedAt: string
  expiresAt: string | null
}) {
  const { user } = await requireAdmin()

  if (isNaN(Date.parse(input.earnedAt))) throw new Error('Invalid earned date')
  if (input.expiresAt !== null && isNaN(Date.parse(input.expiresAt))) {
    throw new Error('Invalid expiration date')
  }

  const admin = createAdminClient()
  const { error } = await admin.from('cert_awards').insert({
    program_id: input.programId,
    user_id: input.userId,
    awarded_by: user.id,
    earned_at: input.earnedAt,
    expires_at: input.expiresAt,
  })
  if (error) {
    if (error.code === '23505') {
      throw new Error('This employee already holds that certification.')
    }
    throw new Error(error.message)
  }
}

// Revoke: keeps the record (stamped with who revoked and when). A revoked
// cert never resurrects automatically — re-certifying a revoked employee
// requires deleting the record first.
export async function revokeCertAward(awardId: string) {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('cert_awards')
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq('id', awardId)
  if (error) throw new Error(error.message)
}

// Delete: removes the award record entirely (mistaken grants). Notification
// rows cascade; attempt/lesson history is untouched.
export async function deleteCertAward(awardId: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('cert_awards').delete().eq('id', awardId)
  if (error) throw new Error(error.message)
}

// ── Enrollment ────────────────────────────────────────────────────────────

// Syncs assignments to exactly the given employee set.
export async function setCertAssignments(programId: string, employeeIds: string[]) {
  const { supabase, user } = await requireAdmin()

  const { data: existing } = await supabase
    .from('cert_assignments')
    .select('user_id')
    .eq('program_id', programId)
    .returns<{ user_id: string }[]>()

  const existingIds = new Set((existing ?? []).map((r) => r.user_id))
  const nextIds = new Set(employeeIds)

  const toRemove = [...existingIds].filter((id) => !nextIds.has(id))
  const toAdd = [...nextIds].filter((id) => !existingIds.has(id))

  if (toRemove.length) {
    const { error } = await supabase
      .from('cert_assignments')
      .delete()
      .eq('program_id', programId)
      .in('user_id', toRemove)
    if (error) throw new Error(error.message)
  }

  if (toAdd.length) {
    const rows = toAdd.map((userId) => ({
      program_id: programId,
      user_id: userId,
      assigned_by: user.id,
    }))
    const { error } = await supabase.from('cert_assignments').insert(rows)
    if (error) throw new Error(error.message)
  }
}
