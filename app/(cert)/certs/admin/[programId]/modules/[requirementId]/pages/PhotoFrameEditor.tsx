'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_FRAMING, MAX_ZOOM, photoFrameStyle, type PhotoFraming } from '@/lib/photo-framing'

// ── Photo framing dialog ──────────────────────────────────────────────────
// Lets an admin decide how a photo sits in its frame without touching the
// file: drag to reposition, slide to zoom, or switch to "show whole photo"
// to letterbox it. The preview frame has the exact aspect ratio learners
// see, and framing is stored as percentages, so the result is identical on
// every screen size. A minimap under the frame outlines the visible region
// of the full photo. Committed on Done; Cancel/Escape discard.

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export default function PhotoFrameEditor({
  url,
  initial,
  ratio,
  frameLabel,
  onDone,
  onClose,
}: {
  url: string
  initial: PhotoFraming
  // Frame width ÷ height, as rendered on the learner page.
  ratio: number
  frameLabel: string
  onDone: (framing: PhotoFraming) => void
  onClose: () => void
}) {
  const [framing, setFraming] = useState<PhotoFraming>(initial)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cover = framing.fit === 'cover'

  // Visible region of the photo (fractions 0–1), device-independent: the
  // frame is treated as `ratio` wide by 1 tall.
  let region: { left: number; top: number; width: number; height: number } | null = null
  if (natural && cover) {
    const scale = Math.max(ratio / natural.w, 1 / natural.h) * framing.zoom
    const w = natural.w * scale
    const h = natural.h * scale
    const width = Math.min(1, ratio / w)
    const height = Math.min(1, 1 / h)
    region = {
      width,
      height,
      left: (framing.focus_x / 100) * (1 - width),
      top: (framing.focus_y / 100) * (1 - height),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!cover) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !natural || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    drag.current = { ...d, x: e.clientX, y: e.clientY }
    setFraming((cur) => {
      const scale = Math.max(rect.width / natural.w, rect.height / natural.h) * cur.zoom
      // Overflow beyond the frame on each axis (≤ 0). The image's offset is
      // focus% × overflow, so a pixel drag maps straight onto focus percent.
      const ox = rect.width - natural.w * scale
      const oy = rect.height - natural.h * scale
      let fx = cur.focus_x
      let fy = cur.focus_y
      if (ox < -0.5) fx = clamp(fx + (dx / ox) * 100, 0, 100)
      if (oy < -0.5) fy = clamp(fy + (dy / oy) * 100, 0, 100)
      return fx === cur.focus_x && fy === cur.focus_y ? cur : { ...cur, focus_x: fx, focus_y: fy }
    })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  function setZoom(z: number) {
    setFraming((f) => ({ ...f, zoom: clamp(Math.round(z * 100) / 100, 1, MAX_ZOOM) }))
  }

  const segBtn = (active: boolean) =>
    `flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? 'bg-emerald-600 text-white' : 'text-plum/70 hover:bg-plum/10'
    }`

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Adjust photo"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-semibold text-plum">Adjust photo</h3>
            <p className="mt-0.5 text-xs text-plum/60">
              {cover
                ? 'Drag the photo to reposition it. Use the slider to zoom in on the part you want.'
                : 'The whole photo is shown inside the frame, with soft space around it.'}
            </p>
          </div>
          <span className="flex-shrink-0 rounded-full bg-plum/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-plum/60">
            {frameLabel}
          </span>
        </div>

        <div
          ref={frameRef}
          style={{ aspectRatio: ratio }}
          className={`relative w-full touch-none select-none overflow-hidden rounded-xl border border-plum/10 bg-plum/[0.06] ${
            cover ? 'cursor-move' : ''
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute inset-0 h-full w-full"
            style={photoFrameStyle(framing)}
          />
          {cover && (
            <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="border border-white/70" />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Minimap of the full photo with the visible region outlined */}
          {natural && (
            <div className="flex-shrink-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-plum/50">Full photo</p>
              <div
                className="relative overflow-hidden rounded-lg border border-plum/15 bg-plum/5"
                style={{ width: natural.w >= natural.h ? 128 : Math.round((128 * natural.w) / natural.h), aspectRatio: natural.w / natural.h }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" draggable={false} className="block h-full w-full object-contain" />
                {region && (
                  <>
                    <span aria-hidden className="absolute inset-0 bg-black/40" />
                    <span
                      aria-hidden
                      className="absolute overflow-hidden border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                      style={{
                        left: `${region.left * 100}%`,
                        top: `${region.top * 100}%`,
                        width: `${region.width * 100}%`,
                        height: `${region.height * 100}%`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        draggable={false}
                        className="absolute max-w-none"
                        style={{
                          width: `${100 / region.width}%`,
                          height: `${100 / region.height}%`,
                          left: `${(-region.left * 100) / region.width}%`,
                          top: `${(-region.top * 100) / region.height}%`,
                        }}
                      />
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-plum/50">Fit</p>
              <div className="flex gap-1 rounded-full border border-plum/15 bg-plum/5 p-1">
                <button type="button" className={segBtn(cover)} onClick={() => setFraming((f) => ({ ...f, fit: 'cover' }))}>
                  Fill frame
                </button>
                <button
                  type="button"
                  className={segBtn(!cover)}
                  onClick={() => setFraming((f) => ({ ...f, fit: 'contain' }))}
                >
                  Show whole photo
                </button>
              </div>
            </div>

            <div className={cover ? '' : 'opacity-40'}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-plum/50">Zoom</p>
                <span className="font-mono text-[11px] text-plum/60">{framing.zoom.toFixed(2)}×</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!cover || framing.zoom <= 1}
                  onClick={() => setZoom(framing.zoom - 0.1)}
                  className="h-7 w-7 flex-shrink-0 rounded-full border border-plum/20 text-sm font-bold text-plum/70 hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={framing.zoom}
                  disabled={!cover}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                  aria-label="Zoom"
                />
                <button
                  type="button"
                  disabled={!cover || framing.zoom >= MAX_ZOOM}
                  onClick={() => setZoom(framing.zoom + 0.1)}
                  className="h-7 w-7 flex-shrink-0 rounded-full border border-plum/20 text-sm font-bold text-plum/70 hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFraming(DEFAULT_FRAMING)}
              className="text-xs text-plum/50 transition-colors hover:text-emerald-700"
            >
              Reset to default
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2.5 border-t border-plum/10 pt-4">
          <button
            type="button"
            onClick={() => onDone(framing)}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Done
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-plum/15 px-5 py-2 text-sm font-semibold text-plum/70 transition-colors hover:border-plum/30 hover:text-plum"
          >
            Cancel
          </button>
          <span className="ml-auto text-[11px] text-plum/40">
            The original file isn&apos;t changed; tapping the photo still opens it in full.
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
