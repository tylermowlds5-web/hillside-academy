import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type {
  StandaloneQuiz,
  StandaloneQuizAssignment,
  StandaloneQuizAttempt,
  Category,
} from '@/lib/types'
import { fmtDate } from '@/lib/format-date'

// Employee-facing Quizzes tab. Two sections:
//   1. Assigned Quizzes — what the employee has been told to take, with due
//      dates and best-attempt status.
//   2. All Available Quizzes — everything else in the library, takeable
//      voluntarily.

type QuizCardData = {
  id: string
  title: string
  description: string | null
  categoryName: string | null
  dueDate: string | null
  bestScore: number | null
  bestPassed: boolean
  attemptCount: number
}

export default async function QuizzesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: quizRows },
    { data: assignmentRows },
    { data: attemptRows },
    { data: categoryRows },
  ] = await Promise.all([
    supabase
      .from('standalone_quizzes')
      .select('id, title, description, category_id, passing_score, questions, created_at, updated_at, created_by')
      .order('created_at', { ascending: false }),
    supabase
      .from('standalone_quiz_assignments')
      .select('quiz_id, due_date')
      .eq('user_id', user.id),
    supabase
      .from('standalone_quiz_attempts')
      .select('quiz_id, score, passed')
      .eq('user_id', user.id),
    supabase.from('categories').select('id, name'),
  ])

  const allQuizzes = (quizRows ?? []) as StandaloneQuiz[]
  const assignments = (assignmentRows ?? []) as Pick<StandaloneQuizAssignment, 'quiz_id' | 'due_date'>[]
  const attempts = (attemptRows ?? []) as Pick<StandaloneQuizAttempt, 'quiz_id' | 'score' | 'passed'>[]
  const categories = (categoryRows ?? []) as Pick<Category, 'id' | 'name'>[]
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))

  // Lookups — due date per assigned quiz, plus best score + total attempt
  // count per quiz (regardless of whether the quiz was assigned).
  const dueDateByQuiz = new Map<string, string | null>()
  for (const a of assignments) dueDateByQuiz.set(a.quiz_id, a.due_date)

  const bestByQuiz = new Map<string, { score: number; passed: boolean }>()
  const attemptCountByQuiz = new Map<string, number>()
  for (const a of attempts) {
    attemptCountByQuiz.set(a.quiz_id, (attemptCountByQuiz.get(a.quiz_id) ?? 0) + 1)
    const existing = bestByQuiz.get(a.quiz_id)
    if (!existing || a.score > existing.score) {
      bestByQuiz.set(a.quiz_id, { score: a.score, passed: a.passed })
    }
  }

  function toCard(q: StandaloneQuiz): QuizCardData {
    const best = bestByQuiz.get(q.id)
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      categoryName: q.category_id ? categoryNameById.get(q.category_id) ?? null : null,
      dueDate: dueDateByQuiz.get(q.id) ?? null,
      bestScore: best?.score ?? null,
      bestPassed: best?.passed ?? false,
      attemptCount: attemptCountByQuiz.get(q.id) ?? 0,
    }
  }

  const assignedQuizIds = new Set(assignments.map((a) => a.quiz_id))
  const assignedQuizzes = allQuizzes.filter((q) => assignedQuizIds.has(q.id)).map(toCard)
  const availableQuizzes = allQuizzes.filter((q) => !assignedQuizIds.has(q.id)).map(toCard)

  return (
    <div className="p-4 sm:p-6 w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-50">Quizzes</h1>
        <p className="text-zinc-400 text-sm mt-1">Knowledge checks assigned to you, plus the rest of the library.</p>
      </div>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Assigned to You
          <span className="ml-2 text-xs font-normal text-zinc-600">{assignedQuizzes.length}</span>
        </h2>
        {assignedQuizzes.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-sm text-zinc-500">No quizzes assigned right now.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {assignedQuizzes.map((q) => <QuizCard key={q.id} quiz={q} assigned />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          All Available Quizzes
          <span className="ml-2 text-xs font-normal text-zinc-600">{availableQuizzes.length}</span>
        </h2>
        {availableQuizzes.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-sm text-zinc-500">No additional quizzes to take.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {availableQuizzes.map((q) => <QuizCard key={q.id} quiz={q} assigned={false} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function QuizCard({ quiz, assigned }: { quiz: QuizCardData; assigned: boolean }) {
  // Status reflects the best-ever attempt — passing once is enough; failing
  // shows red so the employee knows to retake.
  const status: { label: string; tone: 'gray' | 'green' | 'red' } =
    quiz.attemptCount === 0
      ? { label: 'Not Started', tone: 'gray' }
      : quiz.bestPassed
      ? { label: 'Passed', tone: 'green' }
      : { label: 'Failed', tone: 'red' }

  const statusClasses =
    status.tone === 'green' ? 'bg-emerald-500/15 text-emerald-400'
    : status.tone === 'red' ? 'bg-red-500/15 text-red-400'
    : 'bg-zinc-800 text-zinc-400'

  const ctaLabel = quiz.attemptCount === 0 ? 'Take Quiz' : quiz.bestPassed ? 'Retake' : 'Try Again'

  return (
    <Link
      href={`/quizzes/${quiz.id}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 hover:bg-zinc-800/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-100 truncate">{quiz.title}</h3>
          {quiz.categoryName && (
            <span className="inline-block text-[11px] px-2 py-0.5 mt-1 rounded-full bg-zinc-800 text-zinc-400">
              {quiz.categoryName}
            </span>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${statusClasses}`}>
          {status.label}
        </span>
      </div>

      {quiz.description && (
        <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{quiz.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap mb-3">
        {assigned && quiz.dueDate && (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            Due {fmtDate(quiz.dueDate)}
          </span>
        )}
        {quiz.bestScore != null && (
          <span className={quiz.bestPassed ? 'text-emerald-400' : 'text-red-400'}>
            Best: {quiz.bestScore}%
          </span>
        )}
        {quiz.attemptCount > 0 && (
          <span>{quiz.attemptCount} attempt{quiz.attemptCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
        {ctaLabel}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </span>
    </Link>
  )
}
