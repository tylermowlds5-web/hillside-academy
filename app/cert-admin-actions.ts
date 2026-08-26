'use server'

// Admin server actions for the certification builder (/certs/admin).
// All actions are admin-gated; the cert_* RLS policies grant admins full
// access through their own session client, so no service role is needed.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlantData, QuizQuestion } from '@/lib/types'

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
  // Requirements, banks, attempts, lesson progress, assignments, and awards
  // all cascade from the program row.
  const { error } = await supabase.from('cert_programs').delete().eq('id', programId)
  if (error) throw new Error(error.message)
}

// ── Modules (requirements) ────────────────────────────────────────────────

export async function addCertModule(
  programId: string,
  target: { kind: 'video'; videoId: string } | { kind: 'lesson'; title: string }
): Promise<{ id: string }> {
  const { supabase } = await requireAdmin()

  const { data: maxRow } = await supabase
    .from('cert_requirements')
    .select('sort_order')
    .eq('program_id', programId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()
  const nextOrder = (maxRow?.sort_order ?? -1) + 1

  const row =
    target.kind === 'video'
      ? { program_id: programId, video_id: target.videoId, sort_order: nextOrder }
      : { program_id: programId, lesson_title: target.title.trim() || 'New lesson', sort_order: nextOrder }

  const { data, error } = await supabase
    .from('cert_requirements')
    .insert(row)
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Add module failed')
  return { id: data.id }
}

export async function removeCertModule(requirementId: string) {
  const { supabase } = await requireAdmin()
  // Bank groups/questions, attempts, and lesson progress cascade with it.
  const { error } = await supabase.from('cert_requirements').delete().eq('id', requirementId)
  if (error) throw new Error(error.message)
}

export async function reorderCertModules(programId: string, orderedIds: string[]) {
  const { supabase } = await requireAdmin()
  // Targeted updates (not upsert) so no other column is touched; scoped to
  // the program so a stale id from another program can't be moved.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('cert_requirements')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('program_id', programId)
    if (error) throw new Error(error.message)
  }
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

export async function updateCertTextPage(
  pageId: string,
  input: {
    title: string
    body: string
    imageUrl: string | null
    imagePosition: 'top' | 'bottom' | 'left' | 'right'
  }
) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('cert_pages')
    .update({
      title: input.title.trim() || null,
      body: sanitizeRichText(input.body),
      image_url: input.imageUrl,
      image_position: input.imagePosition,
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
    })
    .eq('id', pageId)
    .eq('kind', 'plant')
  if (error) throw new Error(error.message)
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
