import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { StandaloneQuiz, StandaloneQuizAttempt } from '@/lib/types'
import TakeStandaloneQuiz from './TakeStandaloneQuiz'

// Employee-facing take page for a standalone (video-less) quiz. Access is
// gated to admins or to employees who have an assignment for this quiz.

export default async function TakeQuizPage(props: {
  params: Promise<{ quizId: string }>
}) {
  const { quizId } = await props.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: quizData } = await supabase
    .from('standalone_quizzes')
    .select('*')
    .eq('id', quizId)
    .single<StandaloneQuiz>()
  if (!quizData) notFound()

  // Any logged-in user (employee or admin) can take any standalone quiz.
  // Assignment is now just an inbox/due-date signal, not a gate — the employee
  // Quizzes tab also lists unassigned quizzes as "available".

  // Prior attempts (for "best so far" display).
  const { data: attemptRows } = await supabase
    .from('standalone_quiz_attempts')
    .select('id, score, passed, taken_at')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id)
    .order('taken_at', { ascending: false })

  const attempts = (attemptRows ?? []) as Pick<StandaloneQuizAttempt, 'id' | 'score' | 'passed' | 'taken_at'>[]
  const best = attempts.reduce<{ score: number; passed: boolean } | null>(
    (acc, a) => (!acc || a.score > acc.score ? { score: a.score, passed: a.passed } : acc),
    null
  )

  return (
    <div className="p-4 sm:p-6 w-full max-w-3xl mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        My Training
      </Link>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-50">{quizData.title}</h1>
        {quizData.description && (
          <p className="text-zinc-400 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{quizData.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500 flex-wrap">
          <span>{quizData.questions.length} question{quizData.questions.length !== 1 ? 's' : ''}</span>
          <span>Passing: {quizData.passing_score}%</span>
          {best && (
            <span className={best.passed ? 'text-emerald-400' : 'text-red-400'}>
              Best: {best.score}% ({best.passed ? 'Passed' : 'Failed'})
            </span>
          )}
          <span>{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <TakeStandaloneQuiz
        quizId={quizData.id}
        questions={quizData.questions}
        passingScore={quizData.passing_score}
      />
    </div>
  )
}
