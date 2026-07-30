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
import { requireUnlockedModule } from '@/lib/certs'
import { scoreQuiz, toReview } from '@/lib/quiz-scoring'
import type {
  QuizQuestion,
  QuizSubmittedAnswer,
  CertServedGroup,
  ServedCertQuiz,
  CertQuizResult,
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
  if (error) console.error('[updateCertLessonProgress] upsert error:', error.message, error.code)
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
    .insert({ user_id: user.id, requirement_id: requirementId, questions: served })
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
    .select('id, user_id, requirement_id, questions, submitted_at')
    .eq('id', attemptId)
    .single<{
      id: string
      user_id: string
      requirement_id: string
      questions: CertServedGroup[]
      submitted_at: string | null
    }>()

  if (!attempt || attempt.user_id !== user.id) return { error: 'Attempt not found.' }
  if (attempt.submitted_at) return { error: 'This attempt was already submitted.' }

  const { data: req } = await admin
    .from('cert_requirements')
    .select('program_id, quiz_pass_score')
    .eq('id', attempt.requirement_id)
    .single<{ program_id: string; quiz_pass_score: number }>()
  if (!req) return { error: 'Module not found.' }

  const gate = await requireUnlockedModule(supabase, user.id, req.program_id, attempt.requirement_id)
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

  return {
    score,
    passed,
    passScore: req.quiz_pass_score,
    correct,
    total: flat.length,
    review: toReview(storedAnswers),
    moduleCompleted: passed && gate.module.lessonCompleted,
  }
}
