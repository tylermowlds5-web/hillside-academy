'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import VideoPlayer from '@/app/(app)/watch/[videoId]/VideoPlayer'
import { QuestionBlock, isAnswered } from '@/components/quiz/QuestionBlock'
import { AnswerReview } from '@/components/quiz/AnswerReview'
import {
  updateCertLessonProgress,
  markCertLessonRead,
  updateCertPageProgress,
  markCertPageRead,
  startCertQuizAttempt,
  submitCertQuizAttempt,
  abandonCertQuizAttempt,
  touchCertQuizAttempt,
} from '@/app/cert-actions'
import { EXAM_IDLE_MINUTES, EXAM_IDLE_MS } from '@/lib/exam-rules'
import type { Video, QuizSubmittedAnswer, ServedCertQuiz, CertQuizResult, PageBlock, PlantData } from '@/lib/types'
import PlantPage from '@/components/cert/PlantPage'
import PageBlocks from '@/components/cert/PageBlocks'
import { RICH_TEXT_CLASSES } from '@/components/cert/richText'

// One page of a paged lesson module, with this user's progress.
export type LearnerPage = {
  id: string
  kind: 'video' | 'text' | 'plant'
  title: string | null
  body: string | null
  imageUrl: string | null
  imagePosition: 'top' | 'bottom' | 'left' | 'right'
  // Module category name, shown as a section label. Display only — never
  // affects order, gating, or the quiz.
  categoryLabel: string | null
  // Structured plant reference (kind='plant'); completes on mark-as-read
  // like a text page, never the video watch rule.
  plantData: PlantData | null
  // Block content (text pages); non-empty = block rendering, else legacy
  // body/image. Completion unchanged either way.
  blocks: PageBlock[] | null
  // Draft flag. Only ever true for admins previewing — the server strips
  // flagged pages from employees' lists entirely.
  needsReview?: boolean
  video: Video | null
  completed: boolean
  percent_watched: number
  actual_seconds_watched: number
}

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
  pages,
  initialPageId,
  initialLesson,
  quiz,
}: {
  programId: string
  requirementId: string
  kind: 'video' | 'lesson'
  video?: Video | null
  lessonBody?: string | null
  lessonImageUrl?: string | null
  // Non-empty = paged lesson: pages replace the single-body lesson view.
  pages?: LearnerPage[] | null
  // Page to open first (from ?page=); ignored when not yet reachable.
  initialPageId?: string | null
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

      {kind === 'lesson' && pages && pages.length > 0 && (
        <PagedLesson
          programId={programId}
          requirementId={requirementId}
          pages={pages}
          initialPageId={initialPageId ?? null}
          onAllComplete={() => {
            setLessonDone(true)
            router.refresh()
          }}
        />
      )}

      {kind === 'lesson' && (!pages || pages.length === 0) && (
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
//
// ONE SITTING. An attempt lives only while this card is on screen with the
// questions up. Leaving the page (unmount), closing or reloading the tab
// (pagehide → beacon), or EXAM_IDLE_MINUTES without answering (client timer)
// abandons it — the server never stores answers for an abandoned attempt
// and refuses to score one, so the employee starts over with a fresh draw.
// While the attempt is live, Ricky Bobby is switched off for this employee.

// Tells the server the attempt is dead even as the page is being torn down.
function beaconAbandon(attemptId: string) {
  try {
    const body = new Blob([JSON.stringify({ attemptId })], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/api/exam/abandon', body)) {
      abandonCertQuizAttempt(attemptId).catch(() => {})
    }
  } catch {
    abandonCertQuizAttempt(attemptId).catch(() => {})
  }
}

const IDLE_TIMEOUT_MESSAGE = `Timed out — ${EXAM_IDLE_MINUTES} minutes without activity, so that attempt was abandoned and your answers were cleared. Start over when you're ready.`

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
  // Why the last attempt ended without a score (timeout / abandoned).
  const [notice, setNotice] = useState<string | null>(null)

  // Refs so teardown handlers see the live attempt without re-binding.
  const servedRef = useRef<ServedCertQuiz | null>(null)
  const idleTimer = useRef<number | null>(null)
  const lastTouch = useRef(0)

  const clearIdle = useCallback(() => {
    if (idleTimer.current !== null) {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
  }, [])

  // (Re)arm the idle clock. Fires → abandon server-side, wipe answers.
  const armIdle = useCallback(() => {
    clearIdle()
    idleTimer.current = window.setTimeout(() => {
      const live = servedRef.current
      if (!live) return
      abandonCertQuizAttempt(live.attemptId).catch(() => {})
      servedRef.current = null
      setServed(null)
      setAnswers({})
      setNotice(IDLE_TIMEOUT_MESSAGE)
    }, EXAM_IDLE_MS)
  }, [clearIdle])

  // Unmount = the employee navigated away mid-attempt. Abandon it.
  useEffect(() => {
    return () => {
      clearIdle()
      const live = servedRef.current
      if (live) {
        servedRef.current = null
        beaconAbandon(live.attemptId)
      }
    }
  }, [clearIdle])

  // Tab close / reload / leaving the site: beacon the abandon, and let the
  // browser ask "leave site?" so a stray swipe doesn't cost the attempt.
  useEffect(() => {
    if (!served) return
    const attemptId = served.attemptId
    const onPageHide = () => {
      if (servedRef.current?.attemptId === attemptId) {
        servedRef.current = null
        beaconAbandon(attemptId)
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [served])

  const start = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    const res = await startCertQuizAttempt(programId, requirementId)
    setBusy(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    servedRef.current = res
    lastTouch.current = Date.now()
    setServed(res)
    setAnswers({})
    setResult(null)
    armIdle()
  }

  // Every answer change is activity: re-arm the idle clock and (at most
  // once a minute) tell the server so its own idle check agrees.
  const recordAnswer = (i: number, a: QuizSubmittedAnswer) => {
    setAnswers((prev) => ({ ...prev, [i]: a }))
    armIdle()
    const live = servedRef.current
    if (live && Date.now() - lastTouch.current > 60_000) {
      lastTouch.current = Date.now()
      touchCertQuizAttempt(live.attemptId).catch(() => {})
    }
  }

  const submit = async () => {
    if (!served) return
    setBusy(true)
    setError(null)
    const res = await submitCertQuizAttempt(served.attemptId, answers)
    setBusy(false)
    if ('error' in res) {
      if (res.abandoned) {
        // Server says the attempt is dead — drop it here too.
        clearIdle()
        servedRef.current = null
        setServed(null)
        setAnswers({})
        setNotice(res.error)
        return
      }
      setError(res.error)
      return
    }
    clearIdle()
    servedRef.current = null
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
          {result.certEarned && (
            <p className="mx-auto mt-3 max-w-md rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
              🎉 Certification earned — your credential has been recorded.
            </p>
          )}
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
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-zinc-300">
            {allQuestions.length} questions · pass mark {passScore}%
          </p>
          <p className="text-xs text-zinc-500">
            {Object.keys(answers).length}/{allQuestions.length} answered
          </p>
        </div>
        <p className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          One sitting: leaving this page, closing the tab, or {EXAM_IDLE_MINUTES} minutes without answering
          abandons the attempt and clears your answers. Ricky Bobby is off until you submit or leave.
        </p>

        {/* One card per drawn unit. Photo groups: photo beside (desktop) /
            above (mobile) the linked questions as one bordered plant card.
            Standalone questions (no image): a plain question card.
            Presentation only — answers still key by flat question index and
            every part is scored separately by the shared scorer. */}
        <div className="space-y-5">
          {served.groups.map((group, gi) => (
            <div key={gi} className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/60">
              {group.imageUrl && (
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Plant {gi + 1} of {served.groups.length}
                  </p>
                  <p className="text-[11px] text-zinc-500">each part scored separately</p>
                </div>
              )}
              <div className="sm:flex sm:items-stretch">
                {group.imageUrl && (
                  <div className="shrink-0 bg-zinc-950 sm:w-60 md:w-72">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={group.imageUrl}
                      alt={`Plant ${gi + 1}`}
                      className="h-52 w-full object-cover sm:h-full sm:min-h-full"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 divide-y divide-zinc-800/70 px-4 sm:px-5">
                  {group.questions.map((q, qi) => {
                    flatIndex++
                    const i = flatIndex
                    return (
                      <div key={`${gi}-${qi}`} className="py-4">
                        <QuestionBlock
                          q={q}
                          qi={i}
                          answer={answers[i]}
                          onChange={(a) => recordAnswer(i, a)}
                        />
                      </div>
                    )
                  })}
                </div>
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
      <p className="mx-auto mt-2 max-w-md text-xs text-plum/50">
        The exam is one sitting: leaving the page, closing the tab, or {EXAM_IDLE_MINUTES} minutes idle
        abandons it and you start over. Ricky Bobby is unavailable while your exam is open.
      </p>
      {notice && (
        <p className="mx-auto mt-3 max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      )}
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

// ── Paged lesson flow ─────────────────────────────────────────────────────
// Stepper over the module's pages: completed pages are revisitable, forward
// navigation stops at the first incomplete page. Video pages use the real
// VideoPlayer (95% rule); text pages complete on reaching the bottom
// (IntersectionObserver) with a Mark-as-read fallback button. All of it is
// re-verified server-side by the page actions.

// Shared read-to-complete mechanics for text and plant pages: auto-complete
// when a bottom sentinel scrolls into view, with a manual mark-as-read
// fallback. Video pages never use this — they keep the watch rule.
function useReadCompletion(completed: boolean, onRead: () => Promise<void>) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const firedRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trigger = useCallback(async () => {
    if (firedRef.current || completed) return
    firedRef.current = true
    setBusy(true)
    setError(null)
    try {
      await onRead()
    } catch (err) {
      firedRef.current = false
      setError(err instanceof Error ? err.message : 'Could not save — use the button below.')
    } finally {
      setBusy(false)
    }
  }, [completed, onRead])

  // Auto-complete when the reader reaches the bottom of the page.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || completed) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) trigger()
      },
      { threshold: 0.9 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [completed, trigger])

  const retry = useCallback(() => {
    firedRef.current = false
    trigger()
  }, [trigger])

  return { sentinelRef, busy, error, retry }
}

function ReadFooter({
  completed,
  busy,
  error,
  onMark,
  className,
}: {
  completed: boolean
  busy: boolean
  error: string | null
  onMark: () => void
  className: string
}) {
  return (
    <div className={className}>
      {completed ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Page complete
        </p>
      ) : (
        <>
          {error && <p className="mb-2 text-sm font-medium text-red-600">{error}</p>}
          <button
            type="button"
            onClick={onMark}
            disabled={busy}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Mark as read'}
          </button>
        </>
      )}
    </div>
  )
}

function TextPageView({
  page,
  completed,
  onRead,
}: {
  page: LearnerPage
  completed: boolean
  onRead: () => Promise<void>
}) {
  const { sentinelRef, busy, error, retry } = useReadCompletion(completed, onRead)

  const img = page.imageUrl && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={page.imageUrl}
      alt=""
      className={
        page.imagePosition === 'left'
          ? 'float-left mr-4 mb-2 w-1/2 max-w-xs rounded-xl border border-plum/10'
          : page.imagePosition === 'right'
            ? 'float-right ml-4 mb-2 w-1/2 max-w-xs rounded-xl border border-plum/10'
            : 'mb-4 mt-1 max-h-96 w-full rounded-xl border border-plum/10 object-cover'
      }
    />
  )

  return (
    <div className="rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-8">
      {page.title && (
        <h2 className="mb-4 font-serif text-xl font-semibold text-plum">{page.title}</h2>
      )}
      <div className="flow-root">
        {page.imagePosition !== 'bottom' && img}
        {page.body ? (
          <div className={RICH_TEXT_CLASSES} dangerouslySetInnerHTML={{ __html: page.body }} />
        ) : (
          <p className="text-sm text-plum/50">This page has no content yet.</p>
        )}
        {page.imagePosition === 'bottom' && img}
      </div>

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <ReadFooter
        completed={completed}
        busy={busy}
        error={error}
        onMark={retry}
        className="mt-6 border-t border-plum/10 pt-5"
      />
    </div>
  )
}

// Block-based text page: like the plant view, blocks render their own
// cards on the tan background (no white wrapper), followed by the same
// read-to-complete footer.
function BlocksPageView({
  page,
  completed,
  onRead,
}: {
  page: LearnerPage
  completed: boolean
  onRead: () => Promise<void>
}) {
  const { sentinelRef, busy, error, retry } = useReadCompletion(completed, onRead)

  return (
    <div>
      {page.title && (
        <h2 className="mb-4 font-serif text-xl font-semibold text-plum sm:text-2xl">{page.title}</h2>
      )}
      <PageBlocks blocks={page.blocks ?? []} alt={page.title ?? 'Page'} />

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <ReadFooter
        completed={completed}
        busy={busy}
        error={error}
        onMark={retry}
        className="mt-6 border-t border-plum/10 pt-5"
      />
    </div>
  )
}

// Plant reference page: the PlantPage component renders its own card stack
// on the tan background (no white wrapper card), followed by the same
// read-to-complete footer as text pages.
function PlantPageView({
  page,
  completed,
  onRead,
}: {
  page: LearnerPage
  completed: boolean
  onRead: () => Promise<void>
}) {
  const { sentinelRef, busy, error, retry } = useReadCompletion(completed, onRead)

  return (
    <div>
      {page.plantData ? (
        <PlantPage plant={page.plantData} />
      ) : (
        <p className="rounded-xl border border-plum/10 bg-white p-6 text-sm text-plum/60">
          This plant page has no content yet. Let an admin know.
        </p>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <ReadFooter
        completed={completed}
        busy={busy}
        error={error}
        onMark={retry}
        className="mt-6 border-t border-plum/10 pt-5"
      />
    </div>
  )
}

function PagedLesson({
  programId,
  requirementId,
  pages,
  initialPageId,
  onAllComplete,
}: {
  programId: string
  requirementId: string
  pages: LearnerPage[]
  initialPageId: string | null
  onAllComplete: () => void
}) {
  const [done, setDone] = useState<Set<string>>(
    () => new Set(pages.filter((p) => p.completed).map((p) => p.id))
  )
  const firstIncomplete = pages.findIndex((p) => !done.has(p.id))
  const [current, setCurrent] = useState(() => {
    const fallback = firstIncomplete === -1 ? Math.max(0, pages.length - 1) : firstIncomplete
    // A linked page (?page=) opens directly when it's already reachable —
    // completed pages and the first incomplete one; locked pages fall back.
    const requested = initialPageId ? pages.findIndex((p) => p.id === initialPageId) : -1
    return requested !== -1 && requested <= fallback ? requested : fallback
  })

  const markDone = useCallback(
    (pageId: string) => {
      setDone((prev) => {
        const next = new Set(prev)
        next.add(pageId)
        if (next.size === pages.length) onAllComplete()
        return next
      })
    },
    [pages.length, onAllComplete]
  )

  const page = pages[current]
  const maxReachable = firstIncomplete === -1 ? pages.length - 1 : firstIncomplete

  return (
    <div className="space-y-4">
      {/* Page stepper, with a category label at the start of each section */}
      <div className="flex flex-wrap items-center gap-2">
        {pages.map((p, i) => {
          const isDone = done.has(p.id)
          const reachable = i <= maxReachable
          const sectionLabel =
            p.categoryLabel && p.categoryLabel !== pages[i - 1]?.categoryLabel
              ? p.categoryLabel
              : null
          return (
            <span key={p.id} className="contents">
              {sectionLabel && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-plum/40">
                  {sectionLabel}
                </span>
              )}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && setCurrent(i)}
                title={p.kind === 'video' ? (p.video?.title ?? 'Video') : (p.title ?? 'Page')}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i === current
                    ? 'bg-emerald-600 text-white'
                    : isDone
                      ? 'bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/25'
                      : reachable
                        ? 'border-2 border-emerald-600 bg-white text-emerald-700'
                        : 'bg-plum/10 text-plum/40'
                }`}
              >
                {isDone && i !== current ? '✓' : i + 1}
              </button>
            </span>
          )
        })}
        <span className="ml-1 text-xs font-medium text-plum/50">
          Page {current + 1} of {pages.length}
          {page.kind === 'video' ? ' · video' : ' · reading'}
        </span>
        {page.needsReview && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700"
            title="Draft. Skipped in the cert stepper until an admin reviews it; still readable in the Library."
          >
            Needs review · skipped in the stepper
          </span>
        )}
      </div>

      {/* Current page */}
      {page.categoryLabel && (
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
          {page.categoryLabel}
        </p>
      )}
      {page.kind === 'video' ? (
        page.video ? (
          <div key={page.id} className="overflow-hidden rounded-2xl shadow-md">
            <VideoPlayer
              video={page.video}
              initialProgress={{
                percent_watched: page.percent_watched,
                actual_seconds_watched: page.actual_seconds_watched,
                completed: done.has(page.id),
              }}
              persist={(percent, seconds, duration) =>
                updateCertPageProgress(programId, requirementId, page.id, percent, seconds, duration)
              }
              onComplete={() => {
                // Record completion server-side immediately (100% by percent)
                // so the next page's order gate sees it without waiting for
                // the debounced persist tick.
                updateCertPageProgress(programId, requirementId, page.id, 100, page.actual_seconds_watched, 0)
                markDone(page.id)
              }}
            />
          </div>
        ) : (
          <p className="rounded-xl border border-plum/10 bg-white p-6 text-sm text-plum/60">
            This page&apos;s video is no longer available. Let an admin know.
          </p>
        )
      ) : page.kind === 'plant' ? (
        <PlantPageView
          key={page.id}
          page={page}
          completed={done.has(page.id)}
          onRead={async () => {
            const res = await markCertPageRead(programId, requirementId, page.id)
            if (res.error) throw new Error(res.error)
            markDone(page.id)
          }}
        />
      ) : (page.blocks?.length ?? 0) > 0 ? (
        <BlocksPageView
          key={page.id}
          page={page}
          completed={done.has(page.id)}
          onRead={async () => {
            const res = await markCertPageRead(programId, requirementId, page.id)
            if (res.error) throw new Error(res.error)
            markDone(page.id)
          }}
        />
      ) : (
        <TextPageView
          key={page.id}
          page={page}
          completed={done.has(page.id)}
          onRead={async () => {
            const res = await markCertPageRead(programId, requirementId, page.id)
            if (res.error) throw new Error(res.error)
            markDone(page.id)
          }}
        />
      )}

      {/* Prev / next within the module */}
      <div className="flex items-center justify-between">
        {current > 0 ? (
          <button
            type="button"
            onClick={() => setCurrent(current - 1)}
            className="inline-flex items-center gap-2 rounded-full border border-plum/15 px-4 py-2 text-sm font-semibold text-plum/70 transition-colors hover:border-plum/30 hover:text-plum"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Previous page
          </button>
        ) : (
          <span />
        )}
        {current < pages.length - 1 && (
          <button
            type="button"
            disabled={!done.has(page.id)}
            onClick={() => setCurrent(current + 1)}
            title={done.has(page.id) ? undefined : 'Finish this page first'}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next page
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
