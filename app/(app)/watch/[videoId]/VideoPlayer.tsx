'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { Video, Progress } from '@/lib/types'
import { updateVideoProgress, logWatchEvent } from '@/app/actions'

// Fraction of the video's duration that must be watched for it to count as
// completed. Reached via real playback time OR furthest-watched percent
// (forward-seeking is disabled, so percent can't be inflated by skipping).
// Must match the server (updateVideoProgress).
const WATCH_COMPLETION_RATIO = 0.95

// A single playback-time step larger than this (in seconds) is treated as a
// seek/scrub and is NOT counted toward real watch time. Normal playback advances
// in small steps (timeupdate fires ~4×/sec natively; we poll YouTube ~1×/sec).
const MAX_NATIVE_STEP = 1.5
const MAX_YT_STEP = 2.0

// What the inner players report up to the container on each progress tick.
type ProgressUpdate = {
  percent: number // scrubber position 0–100 (for the progress bar + resume)
  watchedSeconds: number // cumulative real playback time actually watched
  duration: number // total video length in seconds
}

function getVideoType(url: string): 'youtube' | 'vimeo' | 'native' {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('vimeo.com')) return 'vimeo'
  return 'native'
}

function getYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?]+)/,
    /youtu\.be\/([^?]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/)
  return m ? m[1] : null
}

// ── Native HTML5 player ────────────────────────────────────────────────────

// A seek that lands more than this many seconds beyond the furthest point the
// user has already reached is treated as "seeking forward" and snapped back.
const SEEK_FORWARD_TOLERANCE = 1.0

function NativePlayer({
  url,
  initialPercent,
  initialSeconds,
  onProgress,
  onResume,
}: {
  url: string
  initialPercent: number
  initialSeconds: number
  onProgress: (u: ProgressUpdate) => void
  onResume?: (seconds: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Cumulative real watch time, seeded with what was already watched in prior
  // sessions so completion can be reached across multiple visits.
  const watchedRef = useRef(initialSeconds)
  // currentTime at the previous tick; null until the first tick after load.
  const lastTimeRef = useRef<number | null>(null)
  const lastReportedPct = useRef(0)
  const seekedToStart = useRef(false)
  // Furthest playback position the user has legitimately reached. Seeking
  // forward past this is blocked; seeking backward (to rewatch) is allowed.
  const highWaterRef = useRef(0)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    function handleLoaded() {
      if (!el) return
      if (!seekedToStart.current && el.duration > 0 && initialPercent > 0) {
        const resumeTime = (initialPercent / 100) * el.duration
        el.currentTime = resumeTime
        // Anchor the delta baseline at the resumed position so the jump from 0
        // to the resume point isn't counted as watched time.
        lastTimeRef.current = resumeTime
        // The resume point is already "reached" — don't let the seek-guard snap
        // it back, and allow backward seeking from here.
        highWaterRef.current = resumeTime
        seekedToStart.current = true
        onResume?.(resumeTime)
      }
    }

    // Block seeking forward past the furthest point already watched. Fires as
    // the user drags the scrubber; we snap currentTime back to the high-water
    // mark before the frame is shown.
    function handleSeeking() {
      if (!el) return
      if (el.currentTime > highWaterRef.current + SEEK_FORWARD_TOLERANCE) {
        el.currentTime = highWaterRef.current
      }
    }

    function handleTimeUpdate() {
      if (!el || !el.duration) return
      const cur = el.currentTime
      const dur = el.duration

      // Accumulate only small forward steps (actual playback). Large jumps
      // (seeking ahead) and rewinds are ignored — they just move the baseline.
      if (lastTimeRef.current !== null) {
        const delta = cur - lastTimeRef.current
        if (delta > 0 && delta <= MAX_NATIVE_STEP) watchedRef.current += delta
      }
      lastTimeRef.current = cur

      // Advance the high-water mark only on natural playback (small steps), so
      // a forward seek that briefly slips through can't ratchet it up.
      if (cur > highWaterRef.current && cur - highWaterRef.current <= MAX_NATIVE_STEP) {
        highWaterRef.current = cur
      }

      const pct = (cur / dur) * 100
      if (pct - lastReportedPct.current >= 2) {
        lastReportedPct.current = pct
        onProgress({ percent: pct, watchedSeconds: watchedRef.current, duration: dur })
      }
    }

    function handleEnded() {
      onProgress({
        percent: 100,
        watchedSeconds: watchedRef.current,
        duration: el?.duration ?? 0,
      })
    }

    el.addEventListener('loadedmetadata', handleLoaded)
    el.addEventListener('seeking', handleSeeking)
    el.addEventListener('timeupdate', handleTimeUpdate)
    el.addEventListener('ended', handleEnded)
    return () => {
      el.removeEventListener('loadedmetadata', handleLoaded)
      el.removeEventListener('seeking', handleSeeking)
      el.removeEventListener('timeupdate', handleTimeUpdate)
      el.removeEventListener('ended', handleEnded)
    }
  }, [initialPercent, onProgress, onResume])

  return (
    <video
      ref={videoRef}
      src={url}
      controls
      className="w-full aspect-video bg-black"
      playsInline
    />
  )
}

// ── YouTube player ────────────────────────────────────────────────────────

declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string
          playerVars?: Record<string, unknown>
          events?: {
            onReady?: (e: { target: YTPlayer }) => void
            onStateChange?: (e: { data: number; target: YTPlayer }) => void
          }
        }
      ) => YTPlayer
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

type YTPlayer = {
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (s: number, allowSeekAhead: boolean) => void
  destroy: () => void
}

function YouTubePlayer({
  videoId,
  initialPercent,
  initialSeconds,
  onProgress,
  onResume,
}: {
  videoId: string
  initialPercent: number
  initialSeconds: number
  onProgress: (u: ProgressUpdate) => void
  onResume?: (seconds: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const watchedRef = useRef(initialSeconds)
  const lastTimeRef = useRef<number | null>(null)
  const lastReportedPct = useRef(0)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress
  const onResumeRef = useRef(onResume)
  onResumeRef.current = onResume

  useEffect(() => {
    function initPlayer() {
      if (!containerRef.current) return
      const el = document.createElement('div')
      containerRef.current.appendChild(el)

      playerRef.current = new window.YT.Player(el, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady(e) {
            if (initialPercent > 0) {
              const dur = e.target.getDuration()
              if (dur > 0) {
                const resumeTime = (initialPercent / 100) * dur
                e.target.seekTo(resumeTime, true)
                onResumeRef.current?.(resumeTime)
              }
            }
          },
          onStateChange(e) {
            const playing = window.YT.PlayerState.PLAYING
            const ended = window.YT.PlayerState.ENDED
            if (e.data === playing) {
              // Re-anchor the delta baseline so any paused/seek gap before this
              // play isn't counted, then poll real playback time once a second.
              lastTimeRef.current = playerRef.current?.getCurrentTime() ?? null
              intervalRef.current = setInterval(() => {
                const p = playerRef.current
                if (!p) return
                const dur = p.getDuration()
                const cur = p.getCurrentTime()
                if (dur <= 0) return

                if (lastTimeRef.current !== null) {
                  const delta = cur - lastTimeRef.current
                  if (delta > 0 && delta <= MAX_YT_STEP) watchedRef.current += delta
                }
                lastTimeRef.current = cur

                const pct = (cur / dur) * 100
                if (pct - lastReportedPct.current >= 2) {
                  lastReportedPct.current = pct
                  onProgressRef.current({ percent: pct, watchedSeconds: watchedRef.current, duration: dur })
                }
              }, 1000)
            } else {
              if (intervalRef.current) clearInterval(intervalRef.current)
              if (e.data === ended) {
                const p = playerRef.current
                onProgressRef.current({
                  percent: 100,
                  watchedSeconds: watchedRef.current,
                  duration: p?.getDuration() ?? 0,
                })
              }
            }
          },
        },
      })
    }

    if (window.YT?.Player) {
      initPlayer()
    } else {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      window.onYouTubeIframeAPIReady = initPlayer
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      playerRef.current?.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return (
    <div
      ref={containerRef}
      className="w-full aspect-video bg-black [&>div]:w-full [&>div]:h-full [&>div>iframe]:w-full [&>div>iframe]:h-full"
    />
  )
}

// ── Vimeo player ────────────────────────────────────────────────────────
// Plain embed — no JS timing API wired up, so it does not report real watch
// time and cannot auto-complete from playback (unchanged behavior).

function VimeoPlayer({
  vimeoId,
  initialPercent,
}: {
  vimeoId: string
  initialPercent: number
}) {
  const start = initialPercent > 0 ? `#t=${Math.round(initialPercent)}%` : ''
  return (
    <div className="w-full aspect-video bg-black">
      <iframe
        src={`https://player.vimeo.com/video/${vimeoId}?autoplay=0${start}`}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function VideoPlayer({
  video,
  initialProgress,
  onComplete,
  persist,
}: {
  video: Video
  // Structural subset so alternate progress sources (e.g. the certification
  // area's cert_lesson_progress rows) can drive the player too.
  initialProgress: Pick<Progress, 'percent_watched' | 'actual_seconds_watched' | 'completed'> | null
  onComplete?: () => void
  // Optional persistence override. When set, progress saves go HERE instead
  // of the default updateVideoProgress + logWatchEvent pair — used by the
  // certification area, whose watch state is deliberately separate from
  // everyday HU progress. Anti-skip and completion behavior are unchanged.
  persist?: (percent: number, watchedSeconds: number, duration: number) => void
}) {
  const alreadyCompleted = initialProgress?.completed ?? false
  // If the video was already completed, start from the beginning instead of
  // resuming near the end. Otherwise resume from the last watched position.
  const initialPercent = alreadyCompleted ? 0 : initialProgress?.percent_watched ?? 0
  const initialSeconds = alreadyCompleted ? 0 : initialProgress?.actual_seconds_watched ?? 0

  const [currentPercent, setCurrentPercent] = useState(initialPercent)
  // Brief "Resuming from X:XX" indicator shown when playback starts mid-video.
  const [resumeNotice, setResumeNotice] = useState<string | null>(null)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ProgressUpdate>({ percent: initialPercent, watchedSeconds: initialSeconds, duration: 0 })
  // Prevent onComplete from firing multiple times per session.
  // The parent remounts this component (via a key prop) when progress resets,
  // so this ref is naturally re-initialized from the latest initialProgress.
  const completedFired = useRef(alreadyCompleted)

  const handleResume = useCallback((seconds: number) => {
    if (seconds < 1) return
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    setResumeNotice(`Resuming from ${m}:${s.toString().padStart(2, '0')}`)
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
    resumeTimeoutRef.current = setTimeout(() => setResumeNotice(null), 4000)
  }, [])

  const saveProgress = useCallback(
    (u: ProgressUpdate) => {
      pending.current = u
      setCurrentPercent(u.percent)

      // Completion is reached by real watch time OR furthest-watched percent
      // (forward-seeking is disabled, so percent can't be inflated). Mirrors
      // the server logic in updateVideoProgress.
      const completeBySeconds = u.duration > 0 && u.watchedSeconds >= WATCH_COMPLETION_RATIO * u.duration
      const completeByPercent = u.percent >= WATCH_COMPLETION_RATIO * 100
      if ((completeBySeconds || completeByPercent) && !completedFired.current) {
        completedFired.current = true
        onComplete?.()
      }

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        const p = pending.current
        if (persist) {
          persist(p.percent, p.watchedSeconds, p.duration)
          return
        }
        updateVideoProgress(video.id, p.percent, p.watchedSeconds, p.duration)
        // Watch-event seconds mirror real playback time (actual_seconds_watched),
        // not wall-clock time on the page.
        logWatchEvent(video.id, p.percent, p.watchedSeconds)
      }, 4000)
    },
    [video.id, onComplete, persist]
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        const p = pending.current
        if (persist) {
          persist(p.percent, p.watchedSeconds, p.duration)
        } else {
          updateVideoProgress(video.id, p.percent, p.watchedSeconds, p.duration)
          logWatchEvent(video.id, p.percent, p.watchedSeconds)
        }
      }
    }
  }, [video.id, persist])

  const type = getVideoType(video.url)

  return (
    <div>
      <div className="relative">
        {type === 'youtube' ? (
          <YouTubePlayer
            videoId={getYouTubeId(video.url) ?? ''}
            initialPercent={initialPercent}
            initialSeconds={initialSeconds}
            onProgress={saveProgress}
            onResume={handleResume}
          />
        ) : type === 'vimeo' ? (
          <VimeoPlayer
            vimeoId={getVimeoId(video.url) ?? ''}
            initialPercent={initialPercent}
          />
        ) : (
          <NativePlayer
            url={video.url}
            initialPercent={initialPercent}
            initialSeconds={initialSeconds}
            onProgress={saveProgress}
            onResume={handleResume}
          />
        )}

        {/* Resume indicator — fades out after a few seconds */}
        {resumeNotice && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-black/80 px-3 py-1.5 text-sm font-medium text-white shadow-lg pointer-events-none">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
            </svg>
            {resumeNotice}
          </div>
        )}
      </div>

      {/* Live progress bar */}
      <div className="h-1 bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${currentPercent}%` }}
        />
      </div>
    </div>
  )
}
