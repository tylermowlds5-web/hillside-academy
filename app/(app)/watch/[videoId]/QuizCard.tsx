'use client'

import { useState } from 'react'
import type { Quiz } from '@/lib/types'
import { submitQuizAttempt } from '@/app/actions'

type Result = {
  score: number
  passed: boolean
  total: number
  correct: number
}

export default function QuizCard({
  quiz,
  videoId,
  passingScore,
  onComplete,
}: {
  quiz: Quiz
  videoId: string
  passingScore: number
  onComplete: (passed: boolean) => void
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const questions = quiz.questions

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (Object.keys(answers).length < questions.length) {
      setError('Please answer all questions before submitting.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await submitQuizAttempt(quiz.id, videoId, answers)
      setResult(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Result screen ─────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${result.passed ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            {result.passed ? (
              <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <h3 className={`text-2xl font-bold mb-1 ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
            {result.passed ? 'Passed!' : 'Not quite'}
          </h3>
          <p className="text-zinc-400 text-sm mb-6">
            You got {result.correct} of {result.total} questions correct
          </p>

          {/* Score ring */}
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="48" fill="none" stroke="#27272a" strokeWidth="8" />
                <circle cx="56" cy="56" r="48" fill="none"
                  stroke={result.passed ? '#10b981' : '#ef4444'} strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 48}`}
                  strokeDashoffset={`${2 * Math.PI * 48 * (1 - result.score / 100)}`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.score}%
                </span>
                <span className="text-xs text-zinc-500">score</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-zinc-500 mb-6">Passing score: {passingScore}%</p>

          {result.passed ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-300 font-medium">Quiz complete!</p>
              <button
                onClick={() => onComplete(true)}
                className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-950/60 border border-amber-800 px-4 py-3 text-sm text-amber-300 flex items-start gap-2.5 text-left max-w-sm mx-auto">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                You must rewatch the video before retaking the quiz.
              </div>
              <button
                onClick={() => onComplete(false)}
                className="px-6 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
              >
                Rewatch Video
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Quiz form ─────────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-50">Knowledge Check</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {questions.length} questions · Passing score: {passingScore}%
          </p>
        </div>
        <div className="text-sm text-zinc-500">
          {Object.keys(answers).length}/{questions.length} answered
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {questions.map((q, qi) => {
          const answered = answers[qi] !== undefined
          return (
            <div key={qi} className="space-y-3">
              <p className="text-sm font-medium text-zinc-200">
                <span className="text-zinc-500 mr-2">{qi + 1}.</span>
                {q.question_text}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <button
                    type="button"
                    key={oi}
                    role="radio"
                    aria-checked={answers[qi] === oi}
                    onClick={() => setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border w-full text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      answers[qi] === oi ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      answers[qi] === oi ? 'border-emerald-500' : 'border-zinc-600'
                    }`}>
                      {answers[qi] === oi && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                    </div>
                    <span className="text-sm text-zinc-200">{opt.option_text}</span>
                  </button>
                ))}
              </div>
              {!answered && <p className="text-xs text-zinc-600">Select an answer</p>}
            </div>
          )
        })}

        {error && (
          <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        <button type="submit" disabled={submitting}
          className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors">
          {submitting ? 'Submitting…' : 'Submit Quiz'}
        </button>
      </form>
    </div>
  )
}
