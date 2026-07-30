'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import VideoPlayer from '@/app/(app)/watch/[videoId]/VideoPlayer'
import { QuestionBlock, isAnswered } from '@/components/quiz/QuestionBlock'
import { AnswerReview } from '@/components/quiz/AnswerReview'
import {
  updateCertLessonProgress,
  markCertLessonRead,
  startCertQuizAttempt,
  submitCertQuizAttempt,
} from '@/app/cert-actions'
import type { Video, QuizSubmittedAnswer, ServedCertQuiz, CertQuizResult } from '@/lib/types'

// Client orchestration for a cert VIDEO or TEXT-LESSON module: the real
// VideoPlayer (same anti-skip + 95% completion behavior as everyday HU) or a
// mark-as-read lesson, both persisting to cert_lesson_progress, then the
// module quiz drawn from the question bank. All lock decisions are
// re-checked server-side by the actions — this component only decides what
// to show, never what counts.

type QuizMeta = {
  hasBank: boolean
  passed: boolean
  passScore: number
  attemptCount: number
  bestScore: number | null
}

export default function CertModuleContent({
  programId,
  requirementId,
  kind,
  video,
  lessonBody,
  lessonImageUrl,
  initialLesson,
  quiz,
}: {
  programId: string
  requirementId: string
  kind: 'video' | 'lesson'
  video?: Video | null
  lessonBody?: string | null
  lessonImageUrl?: string | null
  initialLesson: { percent_watched: number; actual_seconds_watched: number; completed: boolean }
  quiz: QuizMeta
}) {
  const router = useRouter()
  const [lessonDone, setLessonDone] = useState(initialLesson.completed)
  const [quizPassed, setQuizPassed] = useState(quiz.passed)
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState<string | null>(null)

  const persist = useCallback(
    (percent: number, watchedSeconds: number, duration: number) => {
      updateCertLessonProgress(programId, requirementId, percent, watchedSeconds, duration)
    },
    [programId, requirementId]
  )

  const handleComplete = useCallback(() => {
    setLessonDone(true)
    // Refresh so the server re-derives module state (unlocks quiz / next).
    router.refresh()
  }, [router])

  const handleMarkRead = useCallback(async () => {
    setMarking(true)
    setMarkError(null)
    const res = await markCertLessonRead(programId, requirementId)
    setMarking(false)
    if (res && 'error' in res && res.error) {
      setMarkError(res.error)
      return
    }
    setLessonDone(true)
    router.refresh()
  }, [programId, requirementId, router])

  return (
    <div className="space-y-8">
      {kind === 'video' && video && (
        <div className="overflow-hidden rounded-2xl shadow-md">
          <VideoPlayer
            video={video}
            initialProgress={initialLesson}
            onComplete={handleComplete}
            persist={persist}
          />
        </div>
      )}

      {kind === 'lesson' && (
        <div className="rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-8">
          {lessonImageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={lessonImageUrl}
              alt=""
              className="mb-6 max-h-96 w-full rounded-xl border border-plum/10 object-cover"
            />
          )}
          {lessonBody ? (
            <div className="space-y-4 text-sm leading-relaxed text-plum/80 sm:text-base">
              {lessonBody.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-plum/50">This lesson has no content yet.</p>
          )}

          {!lessonDone && (
            <div className="mt-8 border-t border-plum/10 pt-6">
              {markError && <p className="mb-3 text-sm font-medium text-red-500">{markError}</p>}
              <button
                type="button"
                onClick={handleMarkRead}
                disabled={marking}
                className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {marking ? 'Saving…' : 'Mark as read'}
              </button>
            </div>
          )}
        </div>
      )}

      {!lessonDone && kind === 'video' && (
        <p className="rounded-xl border border-plum/10 bg-white p-4 text-sm text-plum/60">
          Watch the full video to
          {quiz.hasBank ? ' unlock this module’s quiz.' : ' complete this module.'} Progress
          here is separate from everyday HU — earlier watches don&apos;t count toward the
          certification.
        </p>
      )}

      {quiz.hasBank && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
            Module quiz
          </h2>
          <div className="mt-3">
            {quizPassed ? (
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <p className="font-serif font-semibold text-plum">Quiz passed</p>
                  <p className="text-xs text-plum/60">
                    Best score {quiz.bestScore ?? '—'}% · pass mark {quiz.passScore}%
                  </p>
                </div>
              </div>
            ) : !lessonDone ? (
              <div className="flex items-center gap-3 rounded-2xl border border-plum/10 bg-white/60 p-5 text-plum/40">
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-sm font-medium">
                  Locked — {kind === 'video' ? 'finish the video' : 'mark the lesson as read'} first.
                </p>
              </div>
            ) : (
              <CertQuizCard
                programId={programId}
                requirementId={requirementId}
                passScore={quiz.passScore}
                attemptCount={quiz.attemptCount}
                onPassed={() => {
                  setQuizPassed(true)
                  router.refresh()
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Quiz taking ───────────────────────────────────────────────────────────
// Each drawn group renders its plant photo ONCE with the linked questions
// beneath it. Answers are keyed by flat question index across all groups so
// the shared QuestionBlock/scorer contract is unchanged.

function CertQuizCard({
  programId,
  requirementId,
  passScore,
  attemptCount,
  onPassed,
}: {
  programId: string
  requirementId: string
  passScore: number
  attemptCount: number
  onPassed: () => void
}) {
  const [served, setServed] = useState<ServedCertQuiz | null>(null)
  const [answers, setAnswers] = useState<Record<number, QuizSubmittedAnswer>>({})
  const [result, setResult] = useState<CertQuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    const res = await startCertQuizAttempt(programId, requirementId)
    setBusy(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    setServed(res)
    setAnswers({})
    setResult(null)
  }

  const submit = async () => {
    if (!served) return
    setBusy(true)
    setError(null)
    const res = await submitCertQuizAttempt(served.attemptId, answers)
    setBusy(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    setResult(res)
    setServed(null)
    if (res.passed) onPassed()
  }

  // ── Result screen ──
  if (result) {
    return (
      <div className="rounded-2xl bg-zinc-950 p-6 sm:p-8">
        <div className="mb-6 text-center">
          <p
            className={`font-serif text-3xl font-semibold ${
              result.passed ? 'text-emerald-400' : 'text-red-500'
            }`}
          >
            {result.score}%
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {result.correct} of {result.total} correct · pass mark {result.passScore}%
          </p>
          <p className={`mt-2 text-sm font-semibold ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
            {result.passed
              ? 'Passed — this module is complete.'
              : 'Not passed yet. Review below, then try again with a fresh set of questions.'}
          </p>
        </div>
        <AnswerReview review={result.review} />
        {!result.passed && (
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Preparing…' : 'Retake quiz'}
          </button>
        )}
      </div>
    )
  }

  // ── Taking screen ──
  if (served) {
    let flatIndex = -1
    const allQuestions = served.groups.flatMap((g) => g.questions)
    const allAnswered = allQuestions.every((q, i) => isAnswered(q, answers[i]))

    return (
      <div className="rounded-2xl bg-zinc-950 p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-zinc-300">
            {allQuestions.length} questions · pass mark {passScore}%
          </p>
          <p className="text-xs text-zinc-500">
            {Object.keys(answers).length}/{allQuestions.length} answered
          </p>
        </div>

        <div className="space-y-6">
          {served.groups.map((group, gi) => (
            <div key={gi} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
              {group.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={group.imageUrl}
                  alt={`Plant ${gi + 1}`}
                  className="mb-5 max-h-80 w-full rounded-lg border border-zinc-800 object-cover"
                />
              )}
              <div className="space-y-6">
                {group.questions.map((q, qi) => {
                  flatIndex++
                  const i = flatIndex
                  return (
                    <QuestionBlock
                      key={`${gi}-${qi}`}
                      q={q}
                      qi={i}
                      answer={answers[i]}
                      onChange={(a) => setAnswers((prev) => ({ ...prev, [i]: a }))}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-sm font-medium text-red-400">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!allAnswered || busy}
          className="mt-6 w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Scoring…' : allAnswered ? 'Submit answers' : 'Answer every question to submit'}
        </button>
      </div>
    )
  }

  // ── Start screen ──
  return (
    <div className="rounded-2xl border border-plum/10 bg-white p-6 text-center shadow-sm sm:p-8">
      <h3 className="font-serif text-lg font-semibold text-plum">Ready for the quiz?</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-plum/60">
        Questions are drawn at random from this module&apos;s bank and the answer order is
        shuffled — retakes get a different set. Pass mark {passScore}%.
        {attemptCount > 0 && <> You&apos;ve made {attemptCount} attempt{attemptCount === 1 ? '' : 's'} so far.</>}
      </p>
      {error && <p className="mt-3 text-sm font-medium text-red-500">{error}</p>}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="mt-5 rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? 'Preparing…' : attemptCount > 0 ? 'Retake quiz' : 'Start quiz'}
      </button>
    </div>
  )
}
