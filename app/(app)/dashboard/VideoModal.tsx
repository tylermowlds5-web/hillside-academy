'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import type { AssignmentWithDetails } from '@/lib/types'
import VideoPlayer from '../watch/[videoId]/VideoPlayer'

export default function VideoModal({
  assignment,
  onClose,
}: {
  assignment: AssignmentWithDetails
  onClose: () => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  const percent = assignment.progress?.percent_watched ?? 0
  const completed = assignment.progress?.completed ?? false

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-4xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 px-1">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-semibold text-zinc-50 truncate">
              {assignment.video.title}
            </h2>
            {assignment.video.category && (
              <span className="text-xs text-zinc-500">{assignment.video.category}</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href={`/watch/${assignment.video.id}`}
              className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
              onClick={onClose}
            >
              Full page →
            </Link>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Player */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex-1 min-h-0">
          <VideoPlayer
            video={assignment.video}
            initialProgress={assignment.progress}
          />

          {/* Meta row */}
          <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-5 flex-wrap">
            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400">{Math.round(percent)}% watched</span>
            </div>

            {completed && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Completed
              </span>
            )}

            {assignment.video.description && (
              <p className="text-xs text-zinc-500 flex-1 line-clamp-1">
                {assignment.video.description}
              </p>
            )}

            <Link
              href={`/watch/${assignment.video.id}`}
              onClick={onClose}
              className="ml-auto text-xs text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1 flex-shrink-0"
            >
              Quiz &amp; full details
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
