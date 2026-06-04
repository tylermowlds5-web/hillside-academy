import Link from 'next/link'
import { fmtDate } from '@/lib/format-date'

// One row per assigned standalone quiz. Shows due date and the employee's
// latest attempt outcome (if any), plus a CTA to take the quiz.

export type AssignedQuizCard = {
  id: string
  title: string
  description: string | null
  categoryName: string | null
  dueDate: string | null
  // Latest attempt outcome (highest score, regardless of pass/fail).
  bestScore: number | null
  bestPassed: boolean
  attemptCount: number
}

export default function QuizzesSection({
  quizzes,
}: {
  quizzes: AssignedQuizCard[]
}) {
  if (quizzes.length === 0) return null

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Quizzes</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Standalone quizzes assigned to you</p>
        </div>
      </div>
      <ul className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800 overflow-hidden">
        {quizzes.map((q) => (
          <li key={q.id}>
            <Link
              href={`/quizzes/${q.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-zinc-100 truncate">{q.title}</h3>
                  {q.categoryName && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{q.categoryName}</span>
                  )}
                </div>
                {q.description && (
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{q.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 flex-wrap">
                  {q.dueDate && (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      Due {fmtDate(q.dueDate)}
                    </span>
                  )}
                  {q.attemptCount === 0 ? (
                    <span>Not taken</span>
                  ) : (
                    <span className={q.bestPassed ? 'text-emerald-400' : 'text-red-400'}>
                      Best: {q.bestScore}% {q.bestPassed ? 'Passed' : 'Failed'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
                  {q.attemptCount === 0 ? 'Take Quiz' : q.bestPassed ? 'Retake' : 'Try Again'}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
