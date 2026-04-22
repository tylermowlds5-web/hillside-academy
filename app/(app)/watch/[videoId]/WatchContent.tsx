'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Video, Progress, Quiz, QuizAttempt } from '@/lib/types'
import VideoPlayer from './VideoPlayer'
import QuizCard from './QuizCard'
import { markPathCompleted, getNextVideoInPath, updateVideoProgress } from '@/app/actions'
import { fmtDate } from '@/lib/format-date'

export type PathContext = {
  pathId: string
  pathName: string
  currentIndex: number
  totalItems: number
  completedCount: number
  isLastVideo: boolean
  nextVideoId: string | null
}

export default function WatchContent({
  video,
  initialProgress,
  quiz,
  bestAttempt,
  pathContext,
}: {
  video: Video
  initialProgress: Progress | null
  quiz: Quiz | null
  bestAttempt: QuizAttempt | null
  pathContext: PathContext | null
}) {
  const router = useRouter()

  // True once the video has been watched to 100% (this session or previously)
  const [videoCompleted, setVideoCompleted] = useState(initialProgress?.completed ?? false)

  // Controls whether the QuizCard form is shown (user clicked "Start Quiz")
  const [showQuiz, setShowQuiz] = useState(false)

  // Track the quiz pass state locally for immediate UI feedback (don't wait for router.refresh)
  const [quizPassed, setQuizPassed] = useState(bestAttempt?.passed ?? false)

  // Force-remount VideoPlayer when progress transitions completed → not-completed
  // (e.g. after a failed quiz resets progress).
  const [playerResetKey, setPlayerResetKey] = useState(0)
  const prevCompletedRef = useRef(initialProgress?.completed ?? false)

  useEffect(() => {
    const wasCompleted = prevCompletedRef.current
    const isCompleted = initialProgress?.completed ?? false
    if (wasCompleted && !isCompleted) {
      setPlayerResetKey((k) => k + 1)
      setQuizPassed(false)
    }
    prevCompletedRef.current = isCompleted
  }, [initialProgress?.completed])

  // Sync quizPassed with latest server bestAttempt
  useEffect(() => {
    if (bestAttempt?.passed) setQuizPassed(true)
  }, [bestAttempt?.passed])

  // Must-rewatch: video not completed AND the last attempt failed
  const mustRewatch = !videoCompleted && bestAttempt !== null && !bestAttempt.passed

  // Ready for next video in path: video completed AND (no quiz OR quiz passed)
  const readyForNext = videoCompleted && (!quiz || quizPassed)

  // If this is the last video in the path and the employee has completed it,
  // mark the path as completed on the server.
  const markedPathCompleteRef = useRef(false)
  useEffect(() => {
    if (
      pathContext?.isLastVideo &&
      readyForNext &&
      !markedPathCompleteRef.current
    ) {
      markedPathCompleteRef.current = true
      markPathCompleted(pathContext.pathId).catch((err) =>
        console.error('[markPathCompleted]', err)
      )
    }
  }, [pathContext, readyForNext])

  const handleVideoComplete = useCallback(() => {
    setVideoCompleted(true)
  }, [])

  function handleQuizComplete(passed: boolean) {
    setShowQuiz(false)
    if (passed) {
      setQuizPassed(true)
      router.refresh()
    } else {
      setQuizPassed(false)
      setVideoCompleted(false)
      router.refresh()
    }
  }

  const pct = Math.round(initialProgress?.percent_watched ?? 0)

  return (
    <>
      {/* Learning path progress banner at the top */}
      {pathContext && <PathProgressBanner pathContext={pathContext} />}

      {/* Must-rewatch banner */}
      {mustRewatch && (
        <div className="mb-4 rounded-xl bg-amber-950/50 border border-amber-800 px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-amber-300 font-medium">
            You must rewatch the video before retaking the quiz.
          </p>
        </div>
      )}

      {/* Player card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
        <VideoPlayer
          key={playerResetKey}
          video={video}
          initialProgress={initialProgress}
          onComplete={handleVideoComplete}
        />

        <div className="p-4 sm:p-6">
          <h1 className="text-lg sm:text-xl font-semibold text-zinc-50">{video.title}</h1>
          {video.description && (
            <p className="text-zinc-400 text-sm mt-2 leading-relaxed">{video.description}</p>
          )}

          {initialProgress && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="text-zinc-400">{pct}% watched</span>
                {videoCompleted && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Video completed
                  </span>
                )}
                {bestAttempt && (
                  <span className={`flex items-center gap-1.5 ${bestAttempt.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                    Quiz best: {bestAttempt.score}% ({bestAttempt.passed ? 'Passed' : 'Failed'})
                  </span>
                )}
                <span className="text-zinc-600">
                  Last watched {fmtDate(initialProgress.last_watched_at)}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Quiz section — only after video is completed ─── */}
      {quiz && videoCompleted && !showQuiz && !quizPassed && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-semibold text-zinc-50 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              You have completed this video.
            </h2>
            <p className="text-zinc-400 text-sm mt-1">Ready to take the quiz?</p>
          </div>
          <button
            onClick={() => setShowQuiz(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors flex-shrink-0"
          >
            Start Quiz
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      )}

      {quiz && videoCompleted && showQuiz && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-50">Knowledge Check</h2>
            <button
              onClick={() => setShowQuiz(false)}
              className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
          </div>
          <QuizCard
            quiz={quiz}
            videoId={video.id}
            passingScore={quiz.passing_score}
            onComplete={handleQuizComplete}
          />
        </div>
      )}

      {/* ── Next Video / Path Completion card ─────────────── */}
      {readyForNext && pathContext && (
        pathContext.isLastVideo ? (
          <PathCompleteCard pathName={pathContext.pathName} pathId={pathContext.pathId} />
        ) : (
          <NextVideoCard
            pathId={pathContext.pathId}
            currentVideoId={video.id}
            nextVideoIdHint={pathContext.nextVideoId}
            currentIndex={pathContext.currentIndex}
            totalItems={pathContext.totalItems}
          />
        )
      )}

      {/* Retake quiz option after passing (not in path context, or optional retake) */}
      {quiz && videoCompleted && quizPassed && !showQuiz && !pathContext && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-semibold text-emerald-400 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Quiz passed
            </h2>
            <p className="text-zinc-400 text-sm mt-1">You can retake the quiz if you'd like.</p>
          </div>
          <button
            onClick={() => setShowQuiz(true)}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm transition-colors flex-shrink-0"
          >
            Retake Quiz
          </button>
        </div>
      )}
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

function NextVideoCard({
  pathId,
  currentVideoId,
  nextVideoIdHint,
  currentIndex,
  totalItems,
}: {
  pathId: string
  currentVideoId: string
  nextVideoIdHint: string | null // from server-rendered props (may be stale)
  currentIndex: number
  totalItems: number
}) {
  const [navigating, setNavigating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function goToNext() {
    // Log the inputs up front so we can see exactly what IDs are used
    console.log('[NextVideo] click — currentVideoId:', currentVideoId, '| pathId:', pathId, '| nextHint (from props):', nextVideoIdHint)

    setNavigating(true)
    setError(null)

    // Safety timeout: if the navigation hasn't happened within 3 seconds,
    // reset the button so the employee isn't stuck on "Loading…".
    const resetTimer = setTimeout(() => {
      console.warn('[NextVideo] navigation timed out after 3s — resetting button state')
      setNavigating(false)
      setError('Navigation timed out. Please try again.')
    }, 3000)

    try {
      // 1. Ensure current video's progress is flushed to the DB so the next
      //    page's lock check sees this video as completed.
      console.log('[NextVideo] saving progress = 100 for current video before navigating')
      await updateVideoProgress(currentVideoId, 100)

      // 2. Always query the server for the next video by sort_order. Avoids
      //    stale server-rendered props.
      const result = await getNextVideoInPath(pathId, currentVideoId)
      console.log('[NextVideo] getNextVideoInPath result:', result)

      if ('error' in result && result.error) {
        clearTimeout(resetTimer)
        setError(result.error)
        setNavigating(false)
        return
      }

      const nextId = 'nextVideoId' in result ? result.nextVideoId : null
      console.log('[NextVideo] resolved nextVideoId:', nextId, '| pathId:', pathId)

      if (!nextId) {
        clearTimeout(resetTimer)
        setError('No next video in this path.')
        setNavigating(false)
        return
      }

      const url = `/watch/${nextId}?path=${pathId}`
      console.log('[NextVideo] navigating via window.location.href to:', url)

      // Use window.location.href directly — full navigation, works even when
      // router.push is silently blocked by the App Router / parent effects.
      // The browser unload will cancel the resetTimer automatically.
      window.location.href = url
    } catch (err) {
      clearTimeout(resetTimer)
      console.error('[NextVideo] error:', err)
      setError(err instanceof Error ? err.message : 'Navigation failed')
      setNavigating(false)
    }
  }

  return (
    <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-5 sm:p-6 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-emerald-300">Great job! Ready for the next video?</h2>
            <p className="text-xs text-emerald-500/80 mt-0.5">
              You've completed video {currentIndex + 1} of {totalItems} in this path.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={goToNext}
          disabled={navigating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors flex-shrink-0 cursor-pointer disabled:opacity-70 disabled:cursor-wait"
        >
          {navigating ? 'Loading…' : 'Next Video'}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

// ── Path progress banner (shown at top of watch page when in a path) ────

function PathProgressBanner({ pathContext }: { pathContext: PathContext }) {
  const pct = pathContext.totalItems > 0
    ? Math.round((pathContext.completedCount / pathContext.totalItems) * 100)
    : 0
  return (
    <div className="mb-4 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500 mb-1">
            <span>Learning Path</span>
            <span>·</span>
            <span className="text-zinc-400">Video {pathContext.currentIndex + 1} of {pathContext.totalItems}</span>
          </div>
          <Link href={`/paths/${pathContext.pathId}`} className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 truncate block">
            {pathContext.pathName}
          </Link>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-zinc-400">{pathContext.completedCount} of {pathContext.totalItems} completed</p>
          <p className="text-sm font-semibold text-emerald-400">{pct}%</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function PathCompleteCard({ pathName, pathId }: { pathName: string; pathId: string }) {
  return (
    <div className="bg-emerald-950/40 border border-emerald-700 rounded-2xl p-6 sm:p-8 text-center mb-6">
      <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-emerald-300 mb-2">
        You have completed {pathName}!
      </h2>
      <p className="text-sm text-emerald-500/80 mb-6 max-w-md mx-auto">
        Great work finishing every video in this learning path. You can return to the path anytime to review your progress.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href={`/paths/${pathId}`}
          className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors"
        >
          Back to Learning Path
        </Link>
        <Link
          href="/paths"
          className="px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
        >
          View All Paths
        </Link>
      </div>
    </div>
  )
}
