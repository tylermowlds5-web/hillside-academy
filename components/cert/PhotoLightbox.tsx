'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlantPhoto } from '@/lib/types'

// ── Full-screen photo lightbox ────────────────────────────────────────────
// Opens the FULL-RESOLUTION image (cards show next/image-optimized copies).
// Gestures via pointer events: pinch-to-zoom (1x–4x, anchored on the pinch
// midpoint), pan while zoomed, swipe left/right between photos at 1x, and
// double-tap to toggle 2x. Closes on tap outside the image, the X button,
// Escape, and Android back (a history entry is pushed on open so the
// hardware back button pops the lightbox, not the page). Body scroll is
// locked while open and focus returns to the opener on close. Rendered
// through a portal so transformed ancestors (dnd-kit rows) can't trap the
// fixed overlay.

const MAX_SCALE = 4
const SWIPE_THRESHOLD = 60
const TAP_SLOP = 8

export default function PhotoLightbox({
  photos,
  index,
  alt,
  onClose,
  onNavigate,
}: {
  photos: PlantPhoto[]
  index: number
  alt: string
  onClose: () => void
  onNavigate: (index: number) => void
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [swipeX, setSwipeX] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const swipeXRef = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null)
  const panLast = useRef<{ x: number; y: number } | null>(null)
  const downX = useRef(0)
  const moved = useRef(0)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const photo = photos[index]
  const count = photos.length

  const setZoom = useCallback((s: number, o: { x: number; y: number }) => {
    scaleRef.current = s
    offsetRef.current = o
    setScale(s)
    setOffset(o)
  }, [])

  const setSwipe = useCallback((x: number) => {
    swipeXRef.current = x
    setSwipeX(x)
  }, [])

  // Reset zoom/swipe whenever the photo changes.
  useEffect(() => {
    setZoom(1, { x: 0, y: 0 })
    setSwipe(0)
  }, [index, setZoom, setSwipe])

  const navigate = useCallback(
    (next: number) => {
      if (next >= 0 && next < count) onNavigate(next)
    },
    [count, onNavigate]
  )
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const indexRef = useRef(index)
  indexRef.current = index

  // Body scroll lock + focus trap-lite (focus the dialog, restore on close).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    containerRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [])

  // Keyboard: Escape closes, arrows move between photos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
      } else if (e.key === 'ArrowRight') {
        navigateRef.current(indexRef.current + 1)
      } else if (e.key === 'ArrowLeft') {
        navigateRef.current(indexRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Android back: push a history entry on open; hardware back pops it and
  // closes the lightbox. Closing any other way consumes our entry so the
  // next back press works on the page as normal.
  useEffect(() => {
    const closedViaPop = { current: false }
    window.history.pushState({ plantLightbox: true }, '')
    const onPop = () => {
      closedViaPop.current = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!closedViaPop.current) window.history.back()
    }
  }, [])

  function pointerDistance(): number {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      pinchStart.current = { dist: pointerDistance(), scale: scaleRef.current }
      panLast.current = null
    } else if (pointers.current.size === 1) {
      panLast.current = { x: e.clientX, y: e.clientY }
      downX.current = e.clientX
      moved.current = 0
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    moved.current += Math.hypot(e.clientX - prev.x, e.clientY - prev.y)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    if (pointers.current.size === 2 && pinchStart.current) {
      // Pinch: scale anchored on the midpoint so the spot between the
      // fingers stays put: t' = p - (p - t) * (s' / s).
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const p = {
        x: mid.x - (rect.left + rect.width / 2),
        y: mid.y - (rect.top + rect.height / 2),
      }
      const s = scaleRef.current
      const next = Math.min(
        MAX_SCALE,
        Math.max(1, (pinchStart.current.scale * pointerDistance()) / pinchStart.current.dist)
      )
      const ratio = next / s
      setZoom(next, {
        x: p.x - (p.x - offsetRef.current.x) * ratio,
        y: p.y - (p.y - offsetRef.current.y) * ratio,
      })
    } else if (pointers.current.size === 1 && panLast.current) {
      const dx = e.clientX - panLast.current.x
      const dy = e.clientY - panLast.current.y
      panLast.current = { x: e.clientX, y: e.clientY }
      if (scaleRef.current > 1) {
        // Pan the zoomed image, loosely clamped to its scaled bounds.
        const maxX = ((scaleRef.current - 1) * rect.width) / 2
        const maxY = ((scaleRef.current - 1) * rect.height) / 2
        setZoom(scaleRef.current, {
          x: Math.max(-maxX, Math.min(maxX, offsetRef.current.x + dx)),
          y: Math.max(-maxY, Math.min(maxY, offsetRef.current.y + dy)),
        })
      } else if (count > 1) {
        // Swipe-between-photos feedback at 1x.
        setSwipe(e.clientX - downX.current)
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 1) {
      // One finger lifted mid-pinch: hand off to panning cleanly.
      const [rest] = [...pointers.current.values()]
      panLast.current = rest
      pinchStart.current = null
    } else if (pointers.current.size === 0) {
      pinchStart.current = null
      panLast.current = null
      if (scaleRef.current < 1.15) setZoom(1, { x: 0, y: 0 })
      if (scaleRef.current <= 1 && swipeXRef.current !== 0) {
        if (swipeXRef.current < -SWIPE_THRESHOLD) navigate(index + 1)
        else if (swipeXRef.current > SWIPE_THRESHOLD) navigate(index - 1)
        setSwipe(0)
      }
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    // Tap outside the image closes; drags/swipes don't.
    if (moved.current < TAP_SLOP && !(e.target instanceof HTMLImageElement)) {
      onClose()
    }
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!(e.target instanceof HTMLImageElement)) return
    if (scaleRef.current > 1) setZoom(1, { x: 0, y: 0 })
    else setZoom(2, { x: 0, y: 0 })
  }

  const caption = photo.caption?.trim() || ''

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={caption || alt}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 outline-none"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {index > 0 && (
        <button
          type="button"
          onClick={() => navigate(index - 1)}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {index < count - 1 && (
        <button
          type="button"
          onClick={() => navigate(index + 1)}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <div
        className="flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-2 py-2"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleBackdropClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Full-resolution original straight from R2 — the cards serve the
            optimized small copies. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={caption || alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${offset.x + swipeX}px, ${offset.y}px) scale(${scale})`,
            transition: pointers.current.size > 0 ? 'none' : 'transform 150ms ease-out',
          }}
        />
      </div>

      <div className="px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 text-center">
        {caption && <p className="text-sm text-white/85">{caption}</p>}
        {count > 1 && (
          <p className="mt-1 font-mono text-xs text-white/50">
            {index + 1} / {count}
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
