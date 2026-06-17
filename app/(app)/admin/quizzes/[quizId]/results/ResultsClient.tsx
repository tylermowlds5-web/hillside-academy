'use client'

import { useState } from 'react'
import type { QuizAttempt } from '@/lib/types'
import { fmtDate, fmtTime } from '@/lib/format-date'
import AnswersModal from '../../../AnswersModal'

export type ResultRow = {
  userId: string
  userName: string
  email: string | null
  dueDate: string | null
  attemptCount: number
  // null = this employee was assigned but hasn't attempted yet.
  // QuizAttempt-shaped so the shared AnswersModal can render it directly.
  bestAttempt: QuizAttempt | null
}

export default function ResultsClient({
  quizTitle,
  passingScore,
  rows,
}: {
  quizTitle: string
  passingScore: number
  rows: ResultRow[]
}) {
  const [viewing, setViewing] = useState<QuizAttempt | null>(null)

  const attempted = rows.filter((r) => r.bestAttempt !== null).length
  const notStarted = rows.length - attempted

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-zinc-200 mb-3 flex items-center gap-3 flex-wrap">
          Employees
          <span className="text-xs font-normal text-zinc-500">
            {rows.length} total · {attempted} attempted · {notStarted} not started
          </span>
        </h2>

        {rows.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <p className="text-zinc-400 text-sm">No employees assigned and no attempts yet.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Employee</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Date Taken</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">Score</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">Attempts</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {rows.map((r) => {
                    const a = r.bestAttempt
                    return (
                      <tr key={r.userId} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-200">
                          <div className="font-medium">{r.userName}</div>
                          {r.email && r.email !== r.userName && (
                            <div className="text-xs text-zinc-500">{r.email}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                          {a ? (
                            <>
                              {fmtDate(a.taken_at)}{' '}
                              <span className="text-zinc-600">{fmtTime(a.taken_at)}</span>
                            </>
                          ) : r.dueDate ? (
                            <span className="text-amber-400">Due {fmtDate(r.dueDate)}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a ? (
                            <span className={`text-sm font-semibold ${a.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                              {a.score}%
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {a ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                            }`}>
                              {a.passed ? 'Passed' : 'Failed'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400">
                              Not Started
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-zinc-400">
                          {r.attemptCount}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {a ? (
                            <button
                              type="button"
                              onClick={() => setViewing(a)}
                              className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
                            >
                              View Answers
                            </button>
                          ) : (
                            <span className="text-zinc-700 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-zinc-800 text-xs text-zinc-500">
              Passing score: {passingScore}%
            </div>
          </div>
        )}
      </section>

      {viewing && (
        <AnswersModal
          attempt={viewing}
          videoTitle={quizTitle}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}
