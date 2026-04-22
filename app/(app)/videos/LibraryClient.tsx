'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Video, Category, SubCategory } from '@/lib/types'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function VideoRow({ video }: { video: Video }) {
  return (
    <Link href={`/watch/${video.id}?from=library`}
      className="flex items-start gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors group">
      <div className="w-20 h-12 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-5 h-5 text-zinc-600 group-hover:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-zinc-100 group-hover:text-white truncate">{video.title}</h3>
        {video.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{video.description}</p>}
        {video.duration != null && <p className="text-xs text-zinc-600 mt-1">{formatDuration(video.duration)}</p>}
      </div>
      <div className="flex-shrink-0 self-center">
        <div className="w-8 h-8 rounded-full bg-zinc-800 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
          <svg className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 ml-0.5 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
        </div>
      </div>
    </Link>
  )
}

interface Props {
  videos: Video[]
  categories: Category[]
  subCategories: SubCategory[]
}

export default function LibraryClient({ videos, categories, subCategories }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string | null>(null)

  const subCategoryMap = new Map(subCategories.map((sc) => [sc.id, sc]))

  // Videos grouped by category_id → sub_category_id
  const videosByCategory = new Map<string, Video[]>()
  for (const v of videos) {
    const key = v.category_id ?? '__uncategorized__'
    if (!videosByCategory.has(key)) videosByCategory.set(key, [])
    videosByCategory.get(key)!.push(v)
  }

  const selectedCat = categories.find((c) => c.id === selectedCategoryId)
  const selectedSubCat = selectedSubCategoryId ? subCategoryMap.get(selectedSubCategoryId) : null

  // ── Level 0: All Categories ───────────────────────────────────────────
  if (selectedCategoryId === null) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Library ({categories.length} {categories.length === 1 ? 'category' : 'categories'})
        </h2>
        {categories.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 text-sm">No videos in the library yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((cat) => {
              const catVideos = videosByCategory.get(cat.id) ?? []
              const catSubCats = subCategories.filter((sc) => sc.category_id === cat.id)
              return (
                <button key={cat.id} onClick={() => setSelectedCategoryId(cat.id)}
                  className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100 group-hover:text-white break-words">{cat.name}</span>
                    <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1.5">
                    {catVideos.length} {catVideos.length === 1 ? 'video' : 'videos'}
                    {catSubCats.length > 0 && ` · ${catSubCats.length} sub ${catSubCats.length === 1 ? 'category' : 'categories'}`}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const catSubCats = subCategories.filter((sc) => sc.category_id === selectedCategoryId)
  const catAllVideos = videosByCategory.get(selectedCategoryId) ?? []
  const catDirectVideos = catAllVideos.filter((v) => !v.sub_category_id)

  // ── Level 1: Category detail ──────────────────────────────────────────
  if (selectedSubCategoryId === null) {
    const hasSubCats = catSubCats.length > 0
    const hasDirectVideos = catDirectVideos.length > 0

    return (
      <div>
        <div className="flex items-center gap-2 mb-5">
          <button onClick={() => setSelectedCategoryId(null)} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            All Categories
          </button>
          <span className="text-zinc-700">/</span>
          <h2 className="text-sm font-semibold text-zinc-200">{selectedCat?.name}</h2>
        </div>

        <div className="space-y-6">
          {hasSubCats && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Sub Categories</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {catSubCats.map((sc) => {
                  const scVideos = catAllVideos.filter((v) => v.sub_category_id === sc.id)
                  return (
                    <button key={sc.id} onClick={() => setSelectedSubCategoryId(sc.id)}
                      className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-colors group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                          </svg>
                          <span className="text-sm font-medium text-zinc-100 group-hover:text-white break-words">{sc.name}</span>
                        </div>
                        <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1.5">{scVideos.length} {scVideos.length === 1 ? 'video' : 'videos'}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {hasDirectVideos && (
            <div>
              {hasSubCats && <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Videos</p>}
              <div className="space-y-2">
                {catDirectVideos.map((v) => <VideoRow key={v.id} video={v} />)}
              </div>
            </div>
          )}

          {!hasSubCats && !hasDirectVideos && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No videos in this category yet.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Level 2: Sub-category videos ──────────────────────────────────────
  const subCatVideos: Video[] = catAllVideos.filter((v) => v.sub_category_id === selectedSubCategoryId)

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => setSelectedCategoryId(null)} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">All Categories</button>
        <span className="text-zinc-700">/</span>
        <button onClick={() => setSelectedSubCategoryId(null)} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">{selectedCat?.name}</button>
        <span className="text-zinc-700">/</span>
        <h2 className="text-sm font-semibold text-zinc-200">{selectedSubCat?.name}</h2>
        <span className="text-xs text-zinc-600">({subCatVideos.length})</span>
      </div>

      {subCatVideos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No videos in this sub category yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subCatVideos.map((v) => <VideoRow key={v.id} video={v} />)}
        </div>
      )}
    </div>
  )
}
