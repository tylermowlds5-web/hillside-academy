import type { CSSProperties } from 'react'
import type { PhotoAspect, PlantPhoto } from './types'

// ── Photo framing (non-destructive crop) ──────────────────────────────────
// A photo's display framing lives beside its url: `fit` ('cover' fills the
// frame and crops the edges; 'contain' shows the whole photo letterboxed),
// a focus point (which point of the photo stays in view while cropping)
// and a zoom multiplier. The original file is never modified — the
// lightbox still opens the full photo. Rendered purely with CSS:
// object-position pins the focus point and transform-origin scales around
// that same point, so zooming never drifts away from what the admin framed.

export type PhotoFraming = {
  fit: 'cover' | 'contain'
  focus_x: number // 0–100, percent of the photo's width
  focus_y: number // 0–100, percent of the photo's height
  zoom: number    // 1 = cover exactly, up to MAX_ZOOM
}

export const MAX_ZOOM = 3

export const DEFAULT_FRAMING: PhotoFraming = { fit: 'cover', focus_x: 50, focus_y: 50, zoom: 1 }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

// Normalizes stored (possibly partial or hand-edited) values into a full
// framing with everything clamped to sane ranges.
export function framingOf(photo: Partial<PlantPhoto> | null | undefined): PhotoFraming {
  return {
    fit: photo?.fit === 'contain' ? 'contain' : 'cover',
    focus_x: clamp(num(photo?.focus_x, 50), 0, 100),
    focus_y: clamp(num(photo?.focus_y, 50), 0, 100),
    zoom: clamp(num(photo?.zoom, 1), 1, MAX_ZOOM),
  }
}

// Only the fields that differ from the defaults, so untouched photos keep
// the plain { url, caption } shape in the DB and exported JSON.
export function compactFraming(f: PhotoFraming): Partial<Pick<PlantPhoto, 'fit' | 'focus_x' | 'focus_y' | 'zoom'>> {
  const out: Partial<Pick<PlantPhoto, 'fit' | 'focus_x' | 'focus_y' | 'zoom'>> = {}
  if (f.fit === 'contain') {
    out.fit = 'contain'
    return out
  }
  if (Math.round(f.focus_x) !== 50) out.focus_x = Math.round(f.focus_x)
  if (Math.round(f.focus_y) !== 50) out.focus_y = Math.round(f.focus_y)
  if (Math.round(f.zoom * 100) !== 100) out.zoom = Math.round(f.zoom * 100) / 100
  return out
}

// Inline style for an <img> that fills its frame (absolute inset-0, or
// next/image `fill`). Pair with an `overflow-hidden` frame.
export function photoFrameStyle(photo: Partial<PlantPhoto> | null | undefined): CSSProperties {
  const f = framingOf(photo)
  if (f.fit === 'contain') return { objectFit: 'contain' }
  const origin = `${f.focus_x}% ${f.focus_y}%`
  return {
    objectFit: 'cover',
    objectPosition: origin,
    transformOrigin: origin,
    transform: f.zoom !== 1 ? `scale(${f.zoom})` : undefined,
  }
}

// Frame shapes for photo groups. Tailwind needs the full class names
// spelled out (no interpolation) so they survive the build scan.
export const PHOTO_ASPECTS: { value: PhotoAspect; label: string; ratio: number; className: string }[] = [
  { value: 'wide', label: 'Wide (16:9)', ratio: 16 / 9, className: 'aspect-[16/9]' },
  { value: 'standard', label: 'Standard (4:3)', ratio: 4 / 3, className: 'aspect-[4/3]' },
  { value: 'square', label: 'Square', ratio: 1, className: 'aspect-square' },
  { value: 'tall', label: 'Tall (3:4)', ratio: 3 / 4, className: 'aspect-[3/4]' },
]

export function photoAspect(value: PhotoAspect | undefined, fallback: PhotoAspect) {
  return PHOTO_ASPECTS.find((a) => a.value === value) ?? PHOTO_ASPECTS.find((a) => a.value === fallback)!
}
