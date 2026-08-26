'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { PageBlock } from '@/lib/types'
import PhotoLightbox from './PhotoLightbox'
import { has, renderBold } from './renderBold'

// ── Block-based text page renderer ────────────────────────────────────────
// Renders a text page's ordered blocks in the plant-page visual style:
// serif section headings, white content cards, burgundy callouts,
// green-dot bullet lists, sanitized rich text, and tappable photo groups
// that open the shared full-size lightbox. Cards get next/image-optimized
// thumbnails; the lightbox fetches the original.

// Mirrors the rich-text styling of legacy text pages (CertModuleContent).
const RICH_TEXT_CLASSES =
  'text-sm leading-relaxed text-plum/80 sm:text-base [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-plum [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:font-serif [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-plum [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6'

export default function PageBlocks({ blocks, alt }: { blocks: PageBlock[]; alt: string }) {
  // Lightbox scoped to one photos block at a time.
  const [lightbox, setLightbox] = useState<{ block: number; index: number } | null>(null)

  const openPhotos =
    lightbox !== null && blocks[lightbox.block]?.type === 'photos'
      ? (blocks[lightbox.block] as Extract<PageBlock, { type: 'photos' }>).photos.filter((p) => has(p.url))
      : null

  return (
    <div className="space-y-4">
      {blocks.map((block, bi) => {
        switch (block.type) {
          case 'heading':
            if (!has(block.text)) return null
            return (
              <div key={bi} className={bi > 0 ? 'pt-4' : ''}>
                <h2 className="font-serif text-xl font-semibold text-plum sm:text-2xl">
                  {block.text}
                </h2>
                {has(block.sub) && <p className="mt-1 text-[14.5px] text-plum/60">{block.sub}</p>}
              </div>
            )

          case 'richtext':
            if (!has(block.html)) return null
            return (
              <div
                key={bi}
                className={RICH_TEXT_CLASSES}
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            )

          case 'card':
            if (!has(block.title) && !has(block.body)) return null
            return (
              <div key={bi} className="rounded-xl border border-plum/10 bg-white px-4 py-3.5 shadow-sm sm:px-5">
                {has(block.title) && <h3 className="text-[15.5px] font-bold text-plum">{block.title}</h3>}
                {has(block.body) && (
                  <p className={`text-[15px] text-plum ${has(block.title) ? 'mt-0.5' : ''}`}>
                    {renderBold(block.body)}
                  </p>
                )}
              </div>
            )

          case 'callout':
            if (!has(block.body)) return null
            return (
              <div key={bi} className="rounded-xl border border-burgundy/20 bg-burgundy/5 px-4 py-4 sm:px-5">
                {has(block.label) && (
                  <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-burgundy">
                    {block.label}
                  </p>
                )}
                <p className="text-[15.5px] text-plum">{renderBold(block.body, 'font-bold text-plum')}</p>
              </div>
            )

          case 'bullets': {
            const items = block.items.filter(has)
            if (items.length === 0) return null
            return (
              <ul key={bi} className="rounded-xl border border-plum/10 bg-white px-5 py-1.5 shadow-sm">
                {items.map((line, i) => (
                  <li key={i} className="relative border-b border-plum/5 py-2.5 pl-5 text-[15px] text-plum last:border-b-0">
                    <span className="absolute left-0 top-[15px] h-1.5 w-1.5 rounded-full bg-emerald-600/60" />
                    {line}
                  </li>
                ))}
              </ul>
            )
          }

          case 'photos': {
            const photos = block.photos.filter((p) => has(p.url))
            if (photos.length === 0) return null
            return (
              <div
                key={bi}
                className={photos.length === 1 ? '' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'}
              >
                {photos.map((photo, pi) => (
                  <figure key={pi} className="overflow-hidden rounded-xl border border-plum/10 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setLightbox({ block: bi, index: pi })}
                      aria-label={`View photo full size: ${has(photo.caption) ? photo.caption : alt}`}
                      className={`relative block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                        photos.length === 1 ? 'aspect-[16/9]' : 'aspect-[4/3]'
                      }`}
                    >
                      <Image
                        src={photo.url}
                        alt={has(photo.caption) ? photo.caption : alt}
                        fill
                        sizes={photos.length === 1 ? '(min-width: 768px) 704px, 92vw' : '(min-width: 640px) 230px, 45vw'}
                        className="object-cover"
                      />
                    </button>
                    {has(photo.caption) && (
                      <figcaption className="px-3 py-2 text-xs text-plum/60">{photo.caption}</figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )
          }
        }
      })}

      {lightbox !== null && openPhotos && openPhotos[lightbox.index] && (
        <PhotoLightbox
          photos={openPhotos}
          index={lightbox.index}
          alt={alt}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox({ block: lightbox.block, index })}
        />
      )}
    </div>
  )
}
