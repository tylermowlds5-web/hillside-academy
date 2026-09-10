'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export type LibraryPlant = {
  id: string
  name: string
  botanical: string | null
  alsoCalled: string | null
  plantType: string | null
  photo: string | null
  lesson: string | null
  section: string | null
  // needs_review: still being polished. Fully readable here; only the cert
  // stepper hides it.
  draft: boolean
}

export type LibraryVideo = {
  id: string
  title: string
  thumbnail: string | null
  category: string | null
  duration: number | null
}

export type LibraryPage = {
  id: string
  title: string
  lesson: string | null
  section: string | null
  draft: boolean
}

type Tab = 'all' | 'plants' | 'videos' | 'pages'

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase()

function fmtDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// A plant's shelf letter: A–Z by first letter of the common name, "#" for
// anything else.
function shelfLetter(name: string): string {
  const c = name.trim().charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

// Small muted marker for pages still flagged needs_review.
export function DraftTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-plum/15 bg-plum/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-plum/50 ${className}`}
      title="Still being polished by an admin"
    >
      Draft
    </span>
  )
}

function SectionHeading({ title, count, id }: { title: string; count: number; id: string }) {
  return (
    <div id={id} className="mb-4 flex items-baseline gap-3 scroll-mt-24">
      <h2 className="font-serif text-2xl font-semibold text-plum">{title}</h2>
      <span className="text-sm font-medium text-plum/50">{count}</span>
    </div>
  )
}

function LeafIcon() {
  return (
    <svg className="h-8 w-8 text-emerald-700/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21c-4.97 0-9-3.582-9-8 0-5 4-9.5 9-10 5 .5 9 5 9 10 0 4.418-4.03 8-9 8zm0 0V10m0 0c-1.5 1.5-3 2-5 2m5-2c1.5 1.5 3 2 5 2"
      />
    </svg>
  )
}

function PlantCard({ plant }: { plant: LibraryPlant }) {
  return (
    <Link
      href={`/library/plant/${plant.id}`}
      className="group flex gap-4 rounded-2xl border border-plum/10 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-plum/20 hover:shadow-md"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-emerald-600/5">
        {plant.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plant.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <LeafIcon />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="flex items-center gap-2">
          <span className="truncate font-serif text-lg font-semibold leading-tight text-plum group-hover:text-plum-dark">
            {plant.name}
          </span>
          {plant.draft && <DraftTag className="shrink-0" />}
        </p>
        {plant.botanical && <p className="mt-0.5 truncate text-sm italic text-plum/60">{plant.botanical}</p>}
        {plant.alsoCalled && (
          <p className="mt-1 truncate text-xs text-plum/50">Also called {plant.alsoCalled}</p>
        )}
        {plant.plantType && (
          <span className="mt-2 inline-block rounded-full bg-emerald-600/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
            {plant.plantType}
          </span>
        )}
      </div>
    </Link>
  )
}

function VideoCard({ video }: { video: LibraryVideo }) {
  const duration = fmtDuration(video.duration)
  return (
    <Link
      href={`/library/video/${video.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-plum/10 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-plum/20 hover:shadow-md"
    >
      <div className="relative aspect-video w-full bg-plum/5">
        {video.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-10 w-10 text-plum/20" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
        )}
        {duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
            {duration}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-plum group-hover:text-plum-dark">
          {video.title}
        </p>
        {video.category && <p className="mt-1 truncate text-xs text-plum/50">{video.category}</p>}
      </div>
    </Link>
  )
}

function PageRow({ page }: { page: LibraryPage }) {
  const context = [page.lesson, page.section].filter(Boolean).join(' · ')
  return (
    <Link
      href={`/library/page/${page.id}`}
      className="group flex items-center gap-4 rounded-xl border border-plum/10 bg-white px-4 py-3 shadow-sm transition-colors hover:border-plum/20"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-plum/5 text-plum/50">
        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-plum group-hover:text-plum-dark">{page.title}</span>
          {page.draft && <DraftTag className="shrink-0" />}
        </span>
        {context && <span className="block truncate text-xs text-plum/50">{context}</span>}
      </span>
      <svg className="h-4 w-4 shrink-0 text-plum/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

export default function LibraryBrowser({
  plants,
  videos,
  pages,
}: {
  plants: LibraryPlant[]
  videos: LibraryVideo[]
  pages: LibraryPage[]
}) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return { plants, videos, pages }
    const terms = q.split(/\s+/).filter(Boolean)
    const hits = (...fields: (string | null | undefined)[]) => {
      const hay = fields.map(norm).join(' ')
      return terms.every((t) => hay.includes(t))
    }
    return {
      plants: plants.filter((p) => hits(p.name, p.botanical, p.alsoCalled, p.plantType, p.lesson, p.section)),
      videos: videos.filter((v) => hits(v.title, v.category)),
      pages: pages.filter((p) => hits(p.title, p.lesson, p.section)),
    }
  }, [q, plants, videos, pages])

  // Plants shelved by first letter, in order, for the alphabetical index.
  const shelves = useMemo(() => {
    const map = new Map<string, LibraryPlant[]>()
    for (const p of filtered.plants) {
      const letter = shelfLetter(p.name)
      const list = map.get(letter)
      if (list) list.push(p)
      else map.set(letter, [p])
    }
    return [...map.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
  }, [filtered.plants])

  const showPlants = tab === 'all' || tab === 'plants'
  const showVideos = tab === 'all' || tab === 'videos'
  const showPages = tab === 'all' || tab === 'pages'
  const total = filtered.plants.length + filtered.videos.length + filtered.pages.length

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'Everything', count: total },
    { key: 'plants', label: 'Plants', count: filtered.plants.length },
    { key: 'videos', label: 'Videos', count: filtered.videos.length },
    { key: 'pages', label: 'Reference pages', count: filtered.pages.length },
  ]

  return (
    <div>
      {/* Search + filter */}
      <div className="sticky top-16 z-10 -mx-4 bg-tan/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <label className="relative block">
          <span className="sr-only">Search the library</span>
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-plum/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plants, videos, and pages…"
            autoComplete="off"
            className="w-full rounded-full border border-plum/15 bg-white py-3 pl-12 pr-4 text-base text-plum shadow-sm outline-none transition-colors placeholder:text-plum/40 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-plum text-white'
                  : 'border border-plum/15 bg-white text-plum/70 hover:border-plum/30 hover:text-plum'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 ${tab === t.key ? 'text-white/60' : 'text-plum/40'}`}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {total === 0 && (
        <p className="mt-10 rounded-2xl border border-dashed border-plum/15 bg-white/60 p-8 text-center text-sm text-plum/60">
          Nothing matches &ldquo;{query.trim()}&rdquo;. Try a common name, a botanical name, or a video title.
        </p>
      )}

      {/* Plants */}
      {showPlants && filtered.plants.length > 0 && (
        <section className="mt-8">
          <SectionHeading id="plants" title="Plants" count={filtered.plants.length} />
          {shelves.length > 1 && (
            <nav aria-label="Jump to letter" className="mb-5 flex flex-wrap gap-1.5">
              {shelves.map(([letter]) => (
                <a
                  key={letter}
                  href={`#plants-${letter === '#' ? 'other' : letter}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-plum/15 bg-white font-mono text-xs font-semibold text-plum/70 transition-colors hover:border-emerald-600 hover:text-emerald-700"
                >
                  {letter}
                </a>
              ))}
            </nav>
          )}
          <div className="space-y-8">
            {shelves.map(([letter, list]) => (
              <div key={letter} id={`plants-${letter === '#' ? 'other' : letter}`} className="scroll-mt-40">
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-serif text-xl font-semibold text-emerald-700">{letter}</span>
                  <span className="h-px flex-1 bg-plum/10" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((p) => (
                    <PlantCard key={p.id} plant={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Videos */}
      {showVideos && filtered.videos.length > 0 && (
        <section className="mt-12">
          <SectionHeading id="videos" title="Videos" count={filtered.videos.length} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </section>
      )}

      {/* Reference pages */}
      {showPages && filtered.pages.length > 0 && (
        <section className="mt-12">
          <SectionHeading id="pages" title="Reference pages" count={filtered.pages.length} />
          <div className="space-y-2">
            {filtered.pages.map((p) => (
              <PageRow key={p.id} page={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
