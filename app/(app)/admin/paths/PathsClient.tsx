'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteLearningPath } from '@/app/actions'
import type { LearningPath } from '@/lib/types'

type PathWithCounts = LearningPath & { videoCount: number; assigneeCount: number }

export default function PathsClient({ paths }: { paths: PathWithCounts[] }) {
  const router = useRouter()

  async function handleDelete(path: PathWithCounts) {
    if (!confirm(`Delete learning path "${path.name}"? Assignments and video links will be removed.`)) return
    await deleteLearningPath(path.id)
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-50">Learning Paths</h1>
          <p className="text-zinc-400 text-sm mt-1">Create ordered sequences of videos</p>
        </div>
        <Link
          href="/admin/paths/new"
          className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          Add Learning Path
        </Link>
      </div>

      {paths.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No learning paths yet. Click "Add Learning Path" to create one.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paths.map((p) => (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
              <Link href={`/admin/paths/${p.id}`} className="block">
                <h2 className="text-base font-semibold text-zinc-100 break-words mb-2">{p.name}</h2>
                {p.description && (
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{p.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-zinc-600">
                  <span>{p.videoCount} {p.videoCount === 1 ? 'video' : 'videos'}</span>
                  <span>·</span>
                  <span>{p.assigneeCount} assigned</span>
                </div>
              </Link>
              <div className="mt-3 pt-3 border-t border-zinc-800 flex gap-2">
                <Link
                  href={`/admin/paths/${p.id}`}
                  className="flex-1 text-center text-xs text-zinc-300 hover:text-emerald-400 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(p)}
                  className="text-xs text-red-500 hover:text-red-400 px-3 py-1.5 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
