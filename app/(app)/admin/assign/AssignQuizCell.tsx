'use client'

import { useState } from 'react'
import type { QuizAttempt } from '@/lib/types'
import AnswersModal from '../AnswersModal'

// Renders the Quiz column for one row of the Current Assignments table:
//   - no quiz for the video       → em-dash
//   - quiz exists but never taken → "Quiz Not Taken" (gray)
//   - quiz taken                  → score + Pass/Fail badge + View Answers button
//                                   (opens the shared AnswersModal)

export default function AssignQuizCell({
  hasQuiz,
  bestAttempt,
  videoTitle,
}: {
  hasQuiz: boolean
  bestAttempt: QuizAttempt | null
  videoTitle: string
}) {
  const [viewing, setViewing] = useState(false)

  if (!hasQuiz) {
    return <span className="text-zinc-700 text-xs">—</span>
  }

  if (!bestAttempt) {
    return <span className="text-xs text-zinc-500">Quiz Not Taken</span>
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-semibold ${bestAttempt.passed ? 'text-emerald-400' : 'text-red-400'}`}>
          {bestAttempt.score}%
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
          bestAttempt.passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>
          {bestAttempt.passed ? 'Pass' : 'Fail'}
        </span>
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors px-2 py-0.5 rounded hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
        >
          View Answers
        </button>
      </div>

      {viewing && (
        <AnswersModal
          attempt={bestAttempt}
          videoTitle={videoTitle}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  )
}
