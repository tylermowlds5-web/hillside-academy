'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { Video, Progress } from '@/lib/types'
import { updateVideoProgress, logWatchEvent } from '@/app/actions'

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
  onProgress,
}: {
  url: string
  initialPercent: number
  onProgress: (percent: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSaved = useRef(0)
  const seekedToStart = useRef(false)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    function handleLoaded() {
      if (!seekedToStart.current && el && el.duration > 0 && initialPercent > 0) {
        el.currentTime = (initialPercent / 100) * el.duration
        seekedToStart.current = true
      }
    }

    function handleTimeUpdate() {
      if (!el || !el.duration) return
      const pct = (el.currentTime / el.duration) * 100
      if (pct - lastSaved.current >= 2) {
        lastSaved.current = pct
        onProgress(pct)
      }
    }

    function handleEnded() {
      onProgress(100)
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
  onProgress,
}: {
  videoId: string
  initialPercent: number
  onProgress: (percent: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSaved = useRef(0)
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
              intervalRef.current = setInterval(() => {
                const p = playerRef.current
                if (!p) return
                const dur = p.getDuration()
                const cur = p.getCurrentTime()
                if (dur > 0) {
                  const pct = (cur / dur) * 100
                  if (pct - lastSaved.current >= 2) {
                    lastSaved.current = pct
                    onProgressRef.current(pct)
                  }
                }
              }, 3000)
            } else {
              if (intervalRef.current) clearInterval(intervalRef.current)
              if (e.data === ended) {
                onProgressRef.current(100)
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
  const [currentPercent, setCurrentPercent] = useState(
    initialProgress?.percent_watched ?? 0
  )
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPercent = useRef(currentPercent)
  const lastSaveWallTime = useRef(Date.now())
  // Prevent onComplete from firing multiple times per session.
  // The parent remounts this component (via a key prop) when progress resets,
  // so this ref is naturally re-initialized from the latest initialProgress.
  const completedFired = useRef(initialProgress?.completed ?? false)

  const saveProgress = useCallback(
    (percent: number) => {
      const now = Date.now()
      const secondsWatched = Math.max(0, Math.round((now - lastSaveWallTime.current) / 1000))
      lastSaveWallTime.current = now

      setCurrentPercent(percent)
      pendingPercent.current = percent

      // Fire onComplete exactly once when video reaches 100%
      if (percent >= 100 && !completedFired.current) {
        completedFired.current = true
        onComplete?.()
      }

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        const pct = pendingPercent.current
        updateVideoProgress(video.id, pct)
        logWatchEvent(video.id, pct, secondsWatched)
      }, 4000)
    },
    [video.id, onComplete]
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        const pct = pendingPercent.current
        const seconds = Math.max(0, Math.round((Date.now() - lastSaveWallTime.current) / 1000))
        updateVideoProgress(video.id, pct)
        logWatchEvent(video.id, pct, seconds)
      }
    }
  }, [video.id])

  const type = getVideoType(video.url)
  const initialPercent = initialProgress?.percent_watched ?? 0

  return (
    <div>
      {type === 'youtube' ? (
        <YouTubePlayer
          videoId={getYouTubeId(video.url) ?? ''}
          initialPercent={initialPercent}
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
