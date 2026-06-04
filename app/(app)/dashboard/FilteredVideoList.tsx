import Link from 'next/link'
import type { Video } from '@/lib/types'

// Row-based list used by the dashboard's filtered sub-routes (watched,
// in-progress, assigned). Each row: thumbnail, title + category, optional
// meta line, Watch button. Keeps the layout consistent across all three.

export type FilteredVideoItem = {
  video: Video
  meta?: string | null
}

export default function FilteredVideoList({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string
  description: string
  items: FilteredVideoItem[]
  emptyMessage: string
}) {
  return (
    <div className="p-4 sm:p-6 w-full max-w-4xl mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Dashboard
      </Link>

      <div className="mb-6 flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-zinc-50">{title}</h1>
        <span className="text-sm text-zinc-500">{items.length}</span>
      </div>
      <p className="text-zinc-400 text-sm mb-6">{description}</p>

      {items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <p className="text-zinc-400 text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800 overflow-hidden">
          {items.map(({ video, meta }) => (
            <li key={video.id} className="flex items-center gap-4 p-4 hover:bg-zinc-800/40 transition-colors">
              {/* Thumbnail */}
              <Link
                href={`/watch/${video.id}`}
                className="flex-shrink-0 w-32 aspect-video rounded-lg overflow-hidden bg-zinc-800 group"
              >
                {video.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnail_url}
                    alt={video.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                    </svg>
                  </div>
                )}
              </Link>

              {/* Title + meta */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/watch/${video.id}`}
                  className="block text-sm font-semibold text-zinc-100 hover:text-emerald-400 transition-colors line-clamp-2"
                >
                  {video.title}
                </Link>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
                  {video.category && <span>{video.category}</span>}
                  {meta && <span>{meta}</span>}
                </div>
              </div>

              {/* Watch button */}
              <Link
                href={`/watch/${video.id}`}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium transition-colors"
              >
                Watch
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
