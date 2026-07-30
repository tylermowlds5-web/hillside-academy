'use server'

// Admin server actions for the certification builder (/certs/admin).
// All actions are admin-gated; the cert_* RLS policies grant admins full
// access through their own session client, so no service role is needed.

import { createClient } from '@/lib/supabase/server'
import type { QuizQuestion } from '@/lib/types'

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

// ── Question bank ─────────────────────────────────────────────────────────

export async function saveCertGroup(input: {
  groupId?: string
  requirementId: string
  label: string
  imageUrl: string | null
}): Promise<{ id: string }> {
  const { supabase } = await requireAdmin()
  const row = {
    label: input.label.trim() || null,
    image_url: input.imageUrl,
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
  questions: QuizQuestion[]
) {
  const { supabase } = await requireAdmin()

  const { error: delError } = await supabase
    .from('cert_questions')
    .delete()
    .eq('requirement_id', requirementId)
  if (delError) throw new Error(delError.message)

  if (questions.length === 0) return

  const rows = questions.map((q, i) => ({ requirement_id: requirementId, question: q, sort_order: i }))
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
