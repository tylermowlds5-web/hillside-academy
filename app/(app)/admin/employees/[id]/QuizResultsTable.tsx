'use client'

import { useState } from 'react'
import type { QuizAttempt, StoredAnswer } from '@/lib/types'
import { fmtDate, fmtTime } from '@/lib/format-date'

function AnswersModal({
  attempt,
  videoTitle,
  onClose,
}: {
  attempt: QuizAttempt
  videoTitle: string
  onClose: () => void
}) {
  const answers = attempt.answers ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0 gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-50">Quiz Answers</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{videoTitle}</p>
            <p className="text-xs text-zinc-600 mt-0.5">
              {fmtDate(attempt.taken_at)} {fmtTime(attempt.taken_at)} ·{' '}
              Score: <span className={attempt.passed ? 'text-emerald-400' : 'text-red-400'}>{attempt.score}%</span>
              {' · '}
              <span className={attempt.passed ? 'text-emerald-400' : 'text-red-400'}>
                {attempt.passed ? 'Passed' : 'Failed'}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Answers list */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {answers.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">No answer data recorded for this attempt.</p>
          ) : (
            answers.map((a: StoredAnswer, i: number) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${
                  a.is_correct ? 'border-emerald-800/70 bg-emerald-950/30' : 'border-red-900/70 bg-red-950/20'
                }`}
              >
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-xs text-zinc-500 flex-shrink-0 font-medium mt-0.5">Q{i + 1}</span>
                  <p className="text-sm font-medium text-zinc-200 leading-snug">{a.question_text}</p>
                </div>
                <div className="space-y-2 pl-5">
                  {/* Their answer */}
                  <div className="flex items-start gap-2">
                    {a.is_correct ? (
                      <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <div>
                      <span className="text-xs text-zinc-500">Their answer: </span>
                      <span className={`text-xs font-medium ${a.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                        {a.chosen}
                      </span>
                    </div>
                  </div>
                  {/* Correct answer (only shown when wrong) */}
                  {!a.is_correct && (
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <div>
                        <span className="text-xs text-zinc-500">Correct answer: </span>
                        <span className="text-xs font-medium text-emerald-400">{a.correct}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

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
