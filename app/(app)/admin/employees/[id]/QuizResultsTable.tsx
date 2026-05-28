'use client'

import { useState } from 'react'
import type { QuizAttempt } from '@/lib/types'
import { fmtDate, fmtTime } from '@/lib/format-date'
import AnswersModal from '../../AnswersModal'

export default function QuizResultsTable({
  attempts,
  passingScoreByQuizId,
  videoTitleById,
  quizVideoMap,
}: {
  attempts: QuizAttempt[]
  passingScoreByQuizId: Record<string, number>
  videoTitleById: Record<string, string>
  quizVideoMap: Record<string, string>
}) {
  const [viewingAttempt, setViewingAttempt] = useState<QuizAttempt | null>(null)

  if (attempts.length === 0) return null

  function getVideoTitle(attempt: QuizAttempt): string {
    // Prefer video_id directly on the attempt (newer records)
    const vidId = attempt.video_id ?? quizVideoMap[attempt.quiz_id]
    return vidId ? (videoTitleById[vidId] ?? 'Unknown video') : 'Unknown video'
  }

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-zinc-200 mb-3">
          Quiz Results
          <span className="ml-2 text-xs font-normal text-zinc-500">{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
        </h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Video</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Date &amp; Time</th>
                  <th className="text-center px-4 py-3 text-zinc-400 font-medium">Score</th>
                  <th className="text-center px-4 py-3 text-zinc-400 font-medium">Result</th>
                  <th className="text-center px-4 py-3 text-zinc-400 font-medium">Pass %</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {attempts.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-2.5 text-zinc-300 max-w-[200px]">
                      <span className="block truncate text-sm" title={getVideoTitle(a)}>
                        {getVideoTitle(a)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">
                      {fmtDate(a.taken_at)}{' '}
                      <span className="text-zinc-600 text-xs">{fmtTime(a.taken_at)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold">
                      <span className={a.passed ? 'text-emerald-400' : 'text-red-400'}>{a.score}%</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {a.passed ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-zinc-500">
                      {passingScoreByQuizId[a.quiz_id] != null ? `${passingScoreByQuizId[a.quiz_id]}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setViewingAttempt(a)}
                        className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800 whitespace-nowrap"
                      >
                        View Answers
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {viewingAttempt && (
        <AnswersModal
          attempt={viewingAttempt}
          videoTitle={getVideoTitle(viewingAttempt)}
          onClose={() => setViewingAttempt(null)}
        />
      )}
    </>
  )
}
