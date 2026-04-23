'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AssignmentWithDetails, Video } from '@/lib/types'
import { fmtDate } from '@/lib/format-date'
import { getEffectiveProgress } from '@/lib/assignment-progress'
import VideoModal from './VideoModal'

function ProgressRing({ percent }: { percent: number }) {
  const r = 18
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#27272a" strokeWidth="4" />
      <circle
        cx="22" cy="22" r={r}
        fill="none" stroke="#10b981" strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-500"
      />
    </svg>
  )
}

function VideoCard({
  assignment,
  onPlayThumbnail,
}: {
  assignment: AssignmentWithDetails
  onPlayThumbnail: (a: AssignmentWithDetails) => void
}) {
  // Progress is assignment-relative: any watching that happened BEFORE this
  // assignment's assigned_at doesn't count. A re-assigned video starts fresh.
  const eff = getEffectiveProgress(assignment.progress, assignment.assigned_at)
  const percent = eff.percent
  const completed = eff.completed

  return (
    <div className="group flex flex-col bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden transition-all hover:-translate-y-0.5">
      {/* ── Thumbnail — click to open modal ── */}
      <button
        type="button"
        onClick={() => onPlayThumbnail(assignment)}
        className="relative aspect-video bg-zinc-800 overflow-hidden block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        aria-label={`Play ${assignment.video.title}`}
      >
        {assignment.video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assignment.video.thumbnail_url}
            alt={assignment.video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-12 h-12 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
        )}

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700/80">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
        </div>

        {/* Completed badge */}
        {completed && (
          <div className="absolute top-2 right-2 bg-emerald-500 rounded-full p-0.5">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-zinc-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </button>

      {/* ── Info ── */}
      <div className="flex items-start gap-3 p-4">
        <div className="relative flex-shrink-0">
          <ProgressRing percent={percent} />
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-zinc-300">
            {Math.round(percent)}%
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/watch/${assignment.video.id}`}
            className="font-medium text-zinc-100 text-sm leading-snug line-clamp-2 hover:text-emerald-400 transition-colors"
          >
            {assignment.video.title}
          </Link>
          {assignment.video.description && (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{assignment.video.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {completed ? (
              <span className="text-xs text-emerald-400 font-medium">Completed</span>
            ) : percent > 0 ? (
              <span className="text-xs text-zinc-400">In progress</span>
            ) : (
              <span className="text-xs text-zinc-600">Not started</span>
            )}
            {assignment.due_date && (
              <span className="text-xs text-zinc-600">
                Due {fmtDate(assignment.due_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LibraryVideoCard({ video }: { video: Video }) {
  return (
    <Link
      href={`/watch/${video.id}`}
      className="group flex flex-col bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
    >
      <div className="relative aspect-video bg-zinc-800 overflow-hidden">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-12 h-12 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-zinc-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="p-4">
        <p className="font-medium text-zinc-100 text-sm leading-snug line-clamp-2 group-hover:text-emerald-400 transition-colors">
          {video.title}
        </p>
        {video.description && (
          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{video.description}</p>
        )}
        {video.category && (
          <span className="inline-block mt-2 text-xs text-zinc-600">{video.category}</span>
        )}
      </div>
    </Link>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export type AssignedPathCard = {
  id: string
  name: string
  description: string | null
  completedCount: number
  total: number
  complete: boolean
}

type Props = {
  assignments: AssignmentWithDetails[]
  totalVideos: number
  videosWatched: number
  inProgressCount: number
  assignedNotStarted: number
  unwatchedVideos: Video[]
  assignedPaths?: AssignedPathCard[]
}

export default function CategoryView({
  assignments,
  totalVideos,
  videosWatched,
  inProgressCount,
  assignedNotStarted,
  unwatchedVideos,
  assignedPaths = [],
}: Props) {
  const router = useRouter()
  const [activeAssignment, setActiveAssignment] = useState<AssignmentWithDetails | null>(null)
  const [showCompleted, setShowCompleted] = useState(true)

  const handleCloseModal = useCallback(() => {
    setActiveAssignment(null)
    router.refresh()
  }, [router])

  // Categorize using assignment-relative progress — a video the employee
  // watched BEFORE being assigned counts as not completed for this assignment.
  const inProgressAssignments = assignments.filter(
    (a) => !getEffectiveProgress(a.progress, a.assigned_at).completed
  )
  const completedAssignments = assignments.filter(
    (a) => getEffectiveProgress(a.progress, a.assigned_at).completed
  )

  const totalAssigned = assignments.length
  const completedCount = completedAssignments.length

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Total Videos</p>
          <p className="text-3xl font-bold text-zinc-50 mt-1">{totalVideos}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Watched</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">{videosWatched}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">In Progress</p>
          <p className="text-3xl font-bold text-yellow-400 mt-1">{inProgressCount}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Assigned</p>
          <p className="text-3xl font-bold text-zinc-50 mt-1">{assignedNotStarted}</p>
        </div>
      </div>

      {/* Overall progress bar for assigned videos */}
      {totalAssigned > 0 && (
        <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-zinc-300">Assignment completion</span>
            <span className="text-sm font-semibold text-emerald-400">
              {Math.round((completedCount / totalAssigned) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / totalAssigned) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Assigned Learning Paths section ── */}
      {assignedPaths.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            Learning Paths
            <span className="text-zinc-600 font-normal normal-case">({assignedPaths.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {assignedPaths.map((p) => {
              const pct = p.total > 0 ? Math.round((p.completedCount / p.total) * 100) : 0
              return (
                <Link
                  key={p.id}
                  href={`/paths/${p.id}`}
                  className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-base font-semibold text-zinc-100 group-hover:text-white break-words">
                      {p.name}
                    </h3>
                    {p.complete && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        COMPLETE
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{p.description}</p>
                  )}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-zinc-400">{p.completedCount} of {p.total} videos</span>
                      <span className={`font-semibold ${p.complete ? 'text-emerald-400' : 'text-zinc-300'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── In Progress section ── */}
      {inProgressAssignments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
            In Progress
            <span className="text-zinc-600 font-normal normal-case">({inProgressAssignments.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inProgressAssignments.map((assignment) => (
              <VideoCard
                key={assignment.id}
                assignment={assignment}
                onPlayThumbnail={setActiveAssignment}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Completed section ── */}
      {completedAssignments.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="w-full flex items-center gap-2 text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 hover:text-zinc-300 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Completed
            <span className="text-zinc-600 font-normal normal-case">({completedAssignments.length})</span>
            <svg
              className={`w-4 h-4 ml-auto transition-transform ${showCompleted ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showCompleted && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedAssignments.map((assignment) => (
                <VideoCard
                  key={assignment.id}
                  assignment={assignment}
                  onPlayThumbnail={setActiveAssignment}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state for assignments ── */}
      {assignments.length === 0 && (
        <div className="text-center py-12 mb-8">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-300">No videos assigned yet</h2>
          <p className="text-zinc-500 text-sm mt-1">Check back later or contact your manager.</p>
        </div>
      )}

      {/* ── Unwatched Videos section ── */}
      {unwatchedVideos.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Unwatched Videos
            </h2>
            <span className="text-zinc-600 text-sm font-normal normal-case">({unwatchedVideos.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unwatchedVideos.map((video) => (
              <LibraryVideoCard key={video.id} video={video} />
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {activeAssignment && (
        <VideoModal
          assignment={activeAssignment}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}
