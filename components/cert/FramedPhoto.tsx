'use client'

import Image from 'next/image'
import type { PlantPhoto } from '@/lib/types'
import { photoFrameStyle } from '@/lib/photo-framing'

// ── Framed photo ──────────────────────────────────────────────────────────
// One next/image-optimized photo drawn inside a fixed-shape frame with the
// admin's framing applied (focus point, zoom, fill vs. show-whole). The
// parent supplies the frame: a positioned element with an aspect ratio and
// overflow-hidden. 'contain' photos sit on a soft backdrop so the
// letterbox reads as intentional rather than as a broken image.

export default function FramedPhoto({
  photo,
  alt,
  sizes,
}: {
  photo: PlantPhoto
  alt: string
  sizes: string
}) {
  const contain = photo.fit === 'contain'
  return (
    <>
      {contain && <span aria-hidden className="absolute inset-0 bg-plum/[0.06]" />}
      <Image src={photo.url} alt={alt} fill sizes={sizes} style={photoFrameStyle(photo)} />
    </>
  )
}
