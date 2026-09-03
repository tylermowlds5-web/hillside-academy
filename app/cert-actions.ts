'use server'

// Server actions for the certification area. Every action re-derives the
// user from the session and re-checks the module gate (requireUnlockedModule)
// before touching the database — the client is never trusted for lock state,
// question selection, or scoring.
//
// The question bank and attempt tables hold answer keys and are admin-only
// under RLS, so bank draws and attempt reads/writes go through the
// service-role client AFTER the session auth + gate checks pass.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUnlockedModule, maybeAwardCertForModule, loadProgramState } from '@/lib/certs'
import { scoreQuiz, toReview } from '@/lib/quiz-scoring'
import type {
  QuizQuestion,
  QuizSubmittedAnswer,
  CertServedGroup,
  ServedCertQuiz,
  CertQuizResult,
  CertPageKind,
} from '@/lib/types'

// Must match VideoPlayer / updateVideoProgress.
const WATCH_COMPLETION_RATIO = 0.95

async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

// ── Lesson watch progress ─────────────────────────────────────────────────
// Persists cert-native watch state. Writes cert_lesson_progress ONLY — the
// everyday progress table is untouched, and prior HU watches of the same
// video count for nothing here.
export async function updateCertLessonProgress(
  programId: string,
  requirementId: string,
  percentWatched: number,
  actualSecondsWatched: number,
  durationSeconds: number
) {
  const { supabase, user } = await getUser()
  if (!user) return

  // Server-side gate: progress only records on a module that is genuinely
  // unlocked for this user right now.
  const gate = await requireUnlockedModule(supabase, user.id, programId, requirementId)
  if (!gate || gate.module.kind !== 'video') return

  const pct = Math.min(100, Math.max(0, percentWatched))
  const wasCompleted = gate.module.lessonCompleted

  const reachedBySeconds =
    durationSeconds > 0 && actualSecondsWatched >= WATCH_COMPLETION_RATIO * durationSeconds
  const reachedByPercent = pct >= WATCH_COMPLETION_RATIO * 100
  const completed = wasCompleted || reachedBySeconds || reachedByPercent

  const { error } = await supabase.from('cert_lesson_progress').upsert(
    {
      user_id: user.id,
      requirement_id: requirementId,
      percent_watched: Math.round(pct),
      actual_seconds_watched: Math.max(0, Math.round(actualSecondsWatched)),
      completed,
      last_watched_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,requirement_id' }
  )
  if (error) {
    console.error('[updateCertLessonProgress] upsert error:', error.message, error.code)
    return
  }

  // Finishing a bank-less final video can complete the whole program.
  if (completed && !wasCompleted) {
    await maybeAwardCertForModule(supabase, user.id, requirementId, programId)
  }
}

// ── Lesson pages ──────────────────────────────────────────────────────────
// Pages advance IN ORDER within a module: progress on page N is only
// accepted when pages 1..N-1 are complete, re-derived from the DB on every
// call — on top of the usual module gate.

async function pageOrderGate(
  userId: string,
  requirementId: string,
  pageId: string
): Promise<{ ok: boolean; kind: CertPageKind | null }> {
  const admin = createAdminClient()
  const [{ data: pages }, { data: progress }, { data: profile }] = await Promise.all([
    admin
      .from('cert_pages')
      .select('id, kind, needs_review')
      .eq('requirement_id', requirementId)
      .order('sort_order')
      .returns<{ id: string; kind: CertPageKind; needs_review: boolean }[]>(),
    admin
      .from('cert_page_progress')
      .select('page_id, completed')
      .eq('user_id', userId)
      .returns<{ page_id: string; completed: boolean }[]>(),
    admin.from('profiles').select('role').eq('id', userId).maybeSingle<{ role: string }>(),
  ])
  // Same visibility rule as the loader: drafts exist only for admins, so an
  // employee can neither progress a draft nor be blocked by one.
  const isAdmin = profile?.role === 'admin'
  const ordered = (pages ?? []).filter((p) => isAdmin || !p.needs_review)
  const idx = ordered.findIndex((p) => p.id === pageId)
  if (idx === -1) return { ok: false, kind: null }
  const done = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.page_id))
  for (let i = 0; i < idx; i++) {
    if (!done.has(ordered[i].id)) return { ok: false, kind: ordered[idx].kind }
  }
  return { ok: true, kind: ordered[idx].kind }
}

// Video page watch progress — same 95%/anti-skip mirror as module videos,
// recorded per page.
export async function updateCertPageProgress(
  programId: string,
  requirementId: string,
  pageId: string,
  percentWatched: number,
  actualSecondsWatched: number,
  durationSeconds: number
) {
  const { supabase, user } = await getUser()
  if (!user) return

  const gate = await requireUnlockedModule(supabase, user.id, programId, requirementId)
  if (!gate || gate.module.kind !== 'lesson') return
  if (!(await pageOrderGate(user.id, requirementId, pageId)).ok) return

  const pct = Math.min(100, Math.max(0, percentWatched))
  const wasCompleted = gate.module.pages?.find((p) => p.id === pageId)?.completed ?? false
  const reachedBySeconds =
    durationSeconds > 0 && actualSecondsWatched >= WATCH_COMPLETION_RATIO * durationSeconds
  const reachedByPercent = pct >= WATCH_COMPLETION_RATIO * 100
  const completed = wasCompleted || reachedBySeconds || reachedByPercent

  const { error } = await supabase.from('cert_page_progress').upsert(
    {
      user_id: user.id,
      page_id: pageId,
      percent_watched: Math.round(pct),
      actual_seconds_watched: Math.max(0, Math.round(actualSecondsWatched)),
      completed,
      last_watched_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,page_id' }
  )
  if (error) {
    console.error('[updateCertPageProgress] upsert error:', error.message)
    return
  }

  // Completing the final page of the final module can finish the program.
  if (completed && !wasCompleted) {
    await maybeAwardCertForModule(supabase, user.id, requirementId, programId)
  }
}

// Text and plant page completion (reached the bottom / mark as read).
export async function markCertPageRead(
  programId: string,
  requirementId: string,
  pageId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await getUser()
  if (!user) return { error: 'Not signed in.' }

  const gate = await requireUnlockedModule(supabase, user.id, programId, requirementId)
  if (!gate || gate.module.kind !== 'lesson') return { error: 'This module is locked.' }
  const order = await pageOrderGate(user.id, requirementId, pageId)
  if (!order.ok) return { error: 'Finish the earlier pages first.' }
  // Mark-as-read is for TEXT and PLANT pages — video pages must be watched.
  if (order.kind !== 'text' && order.kind !== 'plant') {
    return { error: 'This page requires watching the video.' }
  }

  const { error } = await supabase.from('cert_page_progress').upsert(
    {
      user_id: user.id,
      page_id: pageId,
      percent_watched: 100,
      completed: true,
      last_watched_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,page_id' }
  )
  if (error) {
    console.error('[markCertPageRead] upsert error:', error.message)
    return { error: 'Could not save. Try again.' }
  }

  await maybeAwardCertForModule(supabase, user.id, requirementId, programId)
  return {}
}

// ── Text/image lessons ────────────────────────────────────────────────────
// "Mark as read" for a text lesson module. Same gate + same table as video
// watch completion, so the unlock chain works identically.
export async function markCertLessonRead(programId: string, requirementId: string) {
  const { supabase, user } = await getUser()
  if (!user) return { error: 'Not signed in.' }

  const gate = await requireUnlockedModule(supabase, user.id, programId, requirementId)
  if (!gate || gate.module.kind !== 'lesson') return { error: 'This module is locked.' }

  const { error } = await supabase.from('cert_lesson_progress').upsert(
    {
      user_id: user.id,
      requirement_id: requirementId,
      percent_watched: 100,
      completed: true,
      last_watched_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,requirement_id' }
  )
  if (error) {
    console.error('[markCertLessonRead] upsert error:', error.message)
    return { error: 'Could not save. Try again.' }
  }

  // Reading a bank-less final lesson can complete the whole program.
  await maybeAwardCertForModule(supabase, user.id, requirementId, programId)
  return {}
}

// ── Renewal ───────────────────────────────────────────────────────────────
// Starting a renewal on an EXPIRED cert wipes the user's lesson progress for
// the program and stamps the cycle cutoff — from that moment, old quiz
// passes no longer count (see lib/certs.ts), so re-certifying requires
// re-taking every module in order through the normal gates.
export async function startCertRenewal(programId: string): Promise<{ error?: string }> {
  const { supabase, user } = await getUser()
  if (!user) return { error: 'Not signed in.' }

  const state = await loadProgramState(supabase, user.id, programId)
  if (!state?.award) return { error: 'No certification to renew.' }
  if (state.award.revoked_at) return { error: 'This certification was revoked — talk to an admin.' }
  const expired =
    state.award.expires_at && new Date(state.award.expires_at).getTime() < Date.now()
  if (!expired) return { error: 'This certification is still active.' }
  if (state.renewalOpen) return {} // already renewing — idempotent

  const admin = createAdminClient()
  const reqIds = state.modules.map((m) => m.requirementId)
  if (reqIds.length > 0) {
    const { error: wipeError } = await admin
      .from('cert_lesson_progress')
      .delete()
      .eq('user_id', user.id)
      .in('requirement_id', reqIds)
    if (wipeError) {
      console.error('[startCertRenewal] wipe error:', wipeError.message)
      return { error: 'Could not start the renewal. Try again.' }
    }

    // Page progress resets too — renewal re-takes every page of every module.
    const { data: pageRows } = await admin
      .from('cert_pages')
      .select('id')
      .in('requirement_id', reqIds)
      .returns<{ id: string }[]>()
    const pageIds = (pageRows ?? []).map((p) => p.id)
    if (pageIds.length > 0) {
      const { error: pageWipeError } = await admin
        .from('cert_page_progress')
        .delete()
        .eq('user_id', user.id)
        .in('page_id', pageIds)
      if (pageWipeError) {
        console.error('[startCertRenewal] page wipe error:', pageWipeError.message)
        return { error: 'Could not start the renewal. Try again.' }
      }
    }
  }

  const { error } = await admin
    .from('cert_awards')
    .update({ renewal_started_at: new Date().toISOString() })
    .eq('id', state.award.id)
  if (error) {
    console.error('[startCertRenewal] stamp error:', error.message)
    return { error: 'Could not start the renewal. Try again.' }
  }
  return {}
}

// ── Quiz serving ──────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Shuffle option order for choice questions. True/false keeps its
// conventional order; short answer and sequence have no options to shuffle.
function shuffleQuestionOptions(q: QuizQuestion): QuizQuestion {
  const type = q.type ?? 'multiple_choice'
  if ((type === 'multiple_choice' || type === 'multiple_select') && q.options?.length) {
    return { ...q, options: shuffle(q.options) }
  }
  return q
}

// Strip everything that reveals the answer before sending to the client.
function sanitizeQuestion(q: QuizQuestion): QuizQuestion {
  return {
    ...q,
    options: q.options?.map((o) => ({ option_text: o.option_text, is_correct: false })),
    correct_answer: undefined,
    correct_answers: undefined,
  }
}

// Starts an attempt: draws quiz_draw_count random question groups, shuffles
// group order and option order, SNAPSHOTS exactly what was served into the
// attempt row (including the key, server-side only), and returns a sanitized
// copy for the taker. Retakes call this again and get a fresh draw.
export async function startCertQuizAttempt(
  programId: string,
  requirementId: string
): Promise<ServedCertQuiz | { error: string }> {
  const { supabase, user } = await getUser()
  if (!user) return { error: 'Not signed in.' }

  const gate = await requireUnlockedModule(supabase, user.id, programId, requirementId)
  if (!gate) return { error: 'This module is locked.' }
  if (!gate.module.hasQuizBank) return { error: 'This module has no quiz.' }
  if (
    (gate.module.kind === 'video' || gate.module.kind === 'lesson') &&
    !gate.module.lessonCompleted
  ) {
    return {
      error:
        gate.module.kind === 'video'
          ? 'Finish the video before taking the quiz.'
          : 'Mark the lesson as read before taking the quiz.',
    }
  }

  // A drawable UNIT is either a photo group (all its linked questions travel
  // together) or a single standalone question. quiz_draw_count counts units.
  const admin = createAdminClient()
  const [{ data: groups }, { data: standalone }] = await Promise.all([
    admin
      .from('cert_question_groups')
      .select('id, image_url, cert_questions ( id, question, sort_order )')
      .eq('requirement_id', requirementId)
      .returns<
        { id: string; image_url: string | null; cert_questions: { id: string; question: QuizQuestion; sort_order: number }[] }[]
      >(),
    admin
      .from('cert_questions')
      .select('id, question, sort_order')
      .eq('requirement_id', requirementId)
      .returns<{ id: string; question: QuizQuestion; sort_order: number }[]>(),
  ])

  const units: CertServedGroup[] = [
    ...(groups ?? [])
      .filter((g) => g.cert_questions.length > 0)
      .map((g) => ({
        group_id: g.id,
        image_url: g.image_url,
        questions: g.cert_questions
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((q) => q.question),
      })),
    ...(standalone ?? []).map((q) => ({
      group_id: null,
      image_url: null,
      questions: [q.question],
    })),
  ]
  if (units.length === 0) return { error: 'This quiz has no questions yet.' }

  const drawCount = Math.min(Math.max(1, gate.module.quizDrawCount), units.length)
  const served: CertServedGroup[] = shuffle(units)
    .slice(0, drawCount)
    .map((u) => ({ ...u, questions: u.questions.map(shuffleQuestionOptions) }))

  const { data: attempt, error } = await admin
    .from('cert_quiz_attempts')
    // program_id: which program this attempt was taken in (a shared module
    // has several); scoring re-runs that program's gate.
    .insert({ user_id: user.id, requirement_id: requirementId, program_id: programId, questions: served })
    .select('id')
    .single<{ id: string }>()

  if (error || !attempt) {
    console.error('[startCertQuizAttempt] insert error:', error?.message)
    return { error: 'Could not start the quiz. Try again.' }
  }

  return {
    attemptId: attempt.id,
    passScore: gate.module.quizPassScore,
    groups: served.map((g) => ({
      imageUrl: g.image_url,
      questions: g.questions.map(sanitizeQuestion),
    })),
  }
}

// Scores an attempt against ITS OWN stored snapshot (never against what the
// client claims was asked), re-checking the gate first. Flattens the groups
// into one question list so each linked question is scored separately by the
// shared scorer.
export async function submitCertQuizAttempt(
  attemptId: string,
  answers: Record<number, QuizSubmittedAnswer>
): Promise<CertQuizResult | { error: string }> {
  const { supabase, user } = await getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: attempt } = await admin
    .from('cert_quiz_attempts')
    .select('id, user_id, requirement_id, program_id, questions, submitted_at')
    .eq('id', attemptId)
    .single<{
      id: string
      user_id: string
      requirement_id: string
      program_id: string | null
      questions: CertServedGroup[]
      submitted_at: string | null
    }>()

  if (!attempt || attempt.user_id !== user.id) return { error: 'Attempt not found.' }
  if (attempt.submitted_at) return { error: 'This attempt was already submitted.' }

  const { data: req } = await admin
    .from('cert_requirements')
    .select('program_id, quiz_pass_score')
    .eq('id', attempt.requirement_id)
    .single<{ program_id: string | null; quiz_pass_score: number }>()
  if (!req) return { error: 'Module not found.' }

  // The program this attempt was taken in. Attempts from before Step 14 have
  // no program_id; fall back to the module's home program, then to any
  // program that contains the module.
  let programId: string | null = attempt.program_id ?? req.program_id
  if (!programId) {
    const { data: link } = await admin
      .from('cert_program_modules')
      .select('program_id')
      .eq('module_id', attempt.requirement_id)
      .limit(1)
      .maybeSingle<{ program_id: string }>()
    programId = link?.program_id ?? null
  }
  if (!programId) return { error: 'This module is not part of any program.' }

  const gate = await requireUnlockedModule(supabase, user.id, programId, attempt.requirement_id)
  if (!gate) return { error: 'This module is locked.' }

  const flat = attempt.questions.flatMap((g) => g.questions)
  const { score, correct, storedAnswers } = scoreQuiz(flat, answers)
  const passed = score >= req.quiz_pass_score

  const { error } = await admin
    .from('cert_quiz_attempts')
    .update({
      answers: storedAnswers,
      score,
      passed,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', attempt.id)
  if (error) {
    console.error('[submitCertQuizAttempt] update error:', error.message)
    return { error: 'Could not record the attempt. Try again.' }
  }

  // Passing the final module's quiz can complete the whole program — record
  // the award (the official pass record) the moment it happens.
  const moduleCompleted = passed && gate.module.lessonCompleted
  const certEarned = moduleCompleted
    ? await maybeAwardCertForModule(supabase, user.id, attempt.requirement_id, programId)
    : false

  return {
    score,
    passed,
    passScore: req.quiz_pass_score,
    correct,
    total: flat.length,
    review: toReview(storedAnswers),
    moduleCompleted,
    certEarned,
  }
}
