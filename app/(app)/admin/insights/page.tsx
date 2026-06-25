import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { StoredAnswer } from '@/lib/types'
import InsightsClient, { type InsightQuiz, type InsightAttempt } from './InsightsClient'

// Question Analytics Report — surfaces which quiz questions are answered
// incorrectly most often so admins can spot weak training areas. Pulls from
// BOTH video quizzes (quiz_attempts) and standalone quizzes
// (standalone_quiz_attempts); the per-question correct/incorrect data already
// lives in each attempt's `answers` JSONB. All filtering + aggregation happens
// client-side in InsightsClient so the date-range and quiz filters update live.

export default async function QuizInsightsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    { data: videoQuizRows },
    { data: videoRows },
    { data: standaloneQuizRows },
    { data: videoAttemptRows },
    { data: standaloneAttemptRows },
    { data: profileRows },
  ] = await Promise.all([
    supabase.from('quizzes').select('id, video_id'),
    supabase.from('videos').select('id, title'),
    supabase.from('standalone_quizzes').select('id, title'),
    supabase.from('quiz_attempts').select('quiz_id, user_id, taken_at, answers'),
    supabase.from('standalone_quiz_attempts').select('quiz_id, user_id, taken_at, answers'),
    supabase.from('profiles').select('id, full_name, email'),
  ])

  const videoTitleById = new Map<string, string>()
  for (const v of (videoRows ?? []) as { id: string; title: string }[]) {
    videoTitleById.set(v.id, v.title)
  }

  // user_id → display name for the per-question drill-down.
  const nameById = new Map<string, string>()
  for (const p of (profileRows ?? []) as { id: string; full_name: string | null; email: string }[]) {
    nameById.set(p.id, p.full_name ?? p.email)
  }

  // Normalize both quiz kinds into one list. A video quiz has no title of its
  // own — it inherits its video's title.
  const quizzes: InsightQuiz[] = []
  for (const q of (videoQuizRows ?? []) as { id: string; video_id: string }[]) {
    quizzes.push({
      id: q.id,
      title: videoTitleById.get(q.video_id) ?? 'Untitled video quiz',
      kind: 'video',
    })
  }
  for (const q of (standaloneQuizRows ?? []) as { id: string; title: string }[]) {
    quizzes.push({ id: q.id, title: q.title, kind: 'standalone' })
  }

  const knownQuizIds = new Set(quizzes.map((q) => q.id))

  // Flatten each attempt's answers down to just what the report needs. Drop
  // attempts whose quiz no longer exists (deleted) — we have no title for them
  // and they can't be filtered/selected.
  const attempts: InsightAttempt[] = []
  const pushAttempts = (
    rows: { quiz_id: string; user_id: string; taken_at: string; answers: StoredAnswer[] | null }[]
  ) => {
    for (const a of rows) {
      if (!knownQuizIds.has(a.quiz_id) || !a.taken_at) continue
      const answers = (a.answers ?? [])
        .filter((ans) => ans && typeof ans.question_text === 'string')
        .map((ans) => ({
          question_text: ans.question_text,
          is_correct: !!ans.is_correct,
          chosen: ans.chosen ?? '',
          correct: ans.correct ?? '',
        }))
      attempts.push({
        quizId: a.quiz_id,
        userId: a.user_id,
        userName: nameById.get(a.user_id) ?? 'Unknown employee',
        takenAt: a.taken_at,
        answers,
      })
    }
  }
  pushAttempts((videoAttemptRows ?? []) as { quiz_id: string; user_id: string; taken_at: string; answers: StoredAnswer[] | null }[])
  pushAttempts((standaloneAttemptRows ?? []) as { quiz_id: string; user_id: string; taken_at: string; answers: StoredAnswer[] | null }[])

  // Sort quizzes by kind then title for a stable, readable filter list.
  quizzes.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))

  return <InsightsClient quizzes={quizzes} attempts={attempts} />
}
