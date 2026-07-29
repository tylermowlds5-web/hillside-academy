'use client'

// Post-submit review shared by every quiz-taking surface. Shows each question
// marked green (correct) or red (wrong) with the answer the employee gave. The
// correct answer is never shown — wrong answers just read "Incorrect" so
// employees can see where they went wrong without an answer key.

import type { QuizReviewItem } from '@/lib/types'

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function AnswerReview({ review }: { review: QuizReviewItem[] }) {
  return (
    <div className="text-left space-y-3 mb-6">
      <h4 className="text-sm font-semibold text-zinc-300 text-center">Your answers</h4>
      {review.map((a, i) => (
        <div
          key={i}
          className={`rounded-xl border p-4 ${
            a.is_correct ? 'border-emerald-800/70 bg-emerald-950/30' : 'border-red-900/70 bg-red-950/20'
          }`}
        >
          <div className="flex items-start gap-2 mb-3">
            <span className="text-xs text-zinc-500 flex-shrink-0 font-medium mt-0.5">Q{i + 1}</span>
            <p className="text-sm font-medium text-zinc-200 leading-snug break-words min-w-0">{a.question_text}</p>
          </div>

          {a.sequence ? (
            /* Sequence: per-slot green check / red X for the order they chose */
            <div className="space-y-1.5 pl-5">
              {a.sequence.chosen_order.map((theirs, p) => (
                <div key={p} className="flex items-start gap-2">
                  {a.sequence!.slot_correct[p] ? <CheckIcon /> : <CrossIcon />}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-zinc-500 mr-1">Step {p + 1}:</span>
                    <span className={`text-xs font-medium ${a.sequence!.slot_correct[p] ? 'text-emerald-400' : 'text-red-400'}`}>
                      {theirs || '(empty)'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-2 pl-5">
              {a.is_correct ? <CheckIcon /> : <CrossIcon />}
              <div className="min-w-0">
                <span className="text-xs text-zinc-500">Your answer: </span>
                <span className={`text-xs font-medium break-words ${a.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                  {a.chosen}
                </span>
                {!a.is_correct && <span className="text-xs text-red-400 font-medium"> — Incorrect</span>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
