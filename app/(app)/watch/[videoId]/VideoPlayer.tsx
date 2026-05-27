'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { Video, Progress } from '@/lib/types'
import { updateVideoProgress, logWatchEvent } from '@/app/actions'

// Fraction of the video's duration that must be watched, in REAL playback time,
// for it to count as completed. Must match the server (updateVideoProgress).
const WATCH_COMPLETION_RATIO = 0.85

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

function NativePlayer({
  url,
  initialPercent,
  initialSeconds,
  onProgress,
}: {
  url: string
  initialPercent: number
  initialSeconds: number
  onProgress: (u: ProgressUpdate) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Cumulative real watch time, seeded with what was already watched in prior
  // sessions so completion can be reached across multiple visits.
  const watchedRef = useRef(initialSeconds)
  // currentTime at the previous tick; null until the first tick after load.
  const lastTimeRef = useRef<number | null>(null)
  const lastReportedPct = useRef(0)
  const seekedToStart = useRef(false)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    function handleLoaded() {
      if (!el) return
      if (!seekedToStart.current && el.duration > 0 && initialPercent > 0) {
        el.currentTime = (initialPercent / 100) * el.duration
        // Anchor the delta baseline at the resumed position so the jump from 0
        // to the resume point isn't counted as watched time.
        lastTimeRef.current = el.currentTime
        seekedToStart.current = true
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
    el.addEventListener('timeupdate', handleTimeUpdate)
    el.addEventListener('ended', handleEnded)
    return () => {
      el.removeEventListener('loadedmetadata', handleLoaded)
      el.removeEventListener('timeupdate', handleTimeUpdate)
      el.removeEventListener('ended', handleEnded)
    }
  }, [initialPercent, onProgress])

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
}: {
  videoId: string
  initialPercent: number
  initialSeconds: number
  onProgress: (u: ProgressUpdate) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const watchedRef = useRef(initialSeconds)
  const lastTimeRef = useRef<number | null>(null)
  const lastReportedPct = useRef(0)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

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
              if (dur > 0) e.target.seekTo((initialPercent / 100) * dur, true)
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
}: {
  video: Video
  initialProgress: Progress | null
  onComplete?: () => void
}) {
  const initialPercent = initialProgress?.percent_watched ?? 0
  const initialSeconds = initialProgress?.actual_seconds_watched ?? 0

  const [currentPercent, setCurrentPercent] = useState(initialPercent)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ProgressUpdate>({ percent: initialPercent, watchedSeconds: initialSeconds, duration: 0 })
  const lastSaveWallTime = useRef(Date.now())
  // Prevent onComplete from firing multiple times per session.
  // The parent remounts this component (via a key prop) when progress resets,
  // so this ref is naturally re-initialized from the latest initialProgress.
  const completedFired = useRef(initialProgress?.completed ?? false)

  const saveProgress = useCallback(
    (u: ProgressUpdate) => {
      pending.current = u
      setCurrentPercent(u.percent)

      // Completion is gated on REAL watch time, not scrubber position.
      const isComplete = u.duration > 0 && u.watchedSeconds >= WATCH_COMPLETION_RATIO * u.duration
      if (isComplete && !completedFired.current) {
        completedFired.current = true
        onComplete?.()
      }

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        const now = Date.now()
        const sessionSeconds = Math.max(0, Math.round((now - lastSaveWallTime.current) / 1000))
        lastSaveWallTime.current = now
        const p = pending.current
        updateVideoProgress(video.id, p.percent, p.watchedSeconds, p.duration)
        logWatchEvent(video.id, p.percent, sessionSeconds)
      }, 4000)
    },
    [video.id, onComplete]
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        const now = Date.now()
        const sessionSeconds = Math.max(0, Math.round((now - lastSaveWallTime.current) / 1000))
        const p = pending.current
        updateVideoProgress(video.id, p.percent, p.watchedSeconds, p.duration)
        logWatchEvent(video.id, p.percent, sessionSeconds)
      }
    }
  }, [video.id])

  const type = getVideoType(video.url)

  return (
    <div>
      {type === 'youtube' ? (
        <YouTubePlayer
          videoId={getYouTubeId(video.url) ?? ''}
          initialPercent={initialPercent}
          initialSeconds={initialSeconds}
          onProgress={saveProgress}
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
        />
      )}

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
