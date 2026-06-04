'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, Category, StandaloneQuiz, JobRole, UserJobRole } from '@/lib/types'
import { deleteStandaloneQuiz } from '@/app/actions'
import { fmtDate } from '@/lib/format-date'
import QuizModal from './QuizModal'
import AssignQuizModal from './AssignQuizModal'

export default function QuizzesClient({
  quizzes,
  categories,
  employees,
  roles,
  userRoles,
  assignedCount,
  attemptCount,
}: {
  quizzes: StandaloneQuiz[]
  categories: Category[]
  employees: Profile[]
  roles: JobRole[]
  userRoles: UserJobRole[]
  assignedCount: Record<string, number>
  attemptCount: Record<string, number>
}) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<StandaloneQuiz | null>(null)
  const [assigning, setAssigning] = useState<StandaloneQuiz | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const categoryNameById: Record<string, string> = {}
  for (const c of categories) categoryNameById[c.id] = c.name

  async function handleDelete(quiz: StandaloneQuiz) {
    if (!confirm(`Delete "${quiz.title}"? This removes the quiz and all attempts.`)) return
    setDeleting(quiz.id)
    try {
      await deleteStandaloneQuiz(quiz.id)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Quizzes</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Standalone quizzes (not attached to any video) — build, assign, and review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Quiz
        </button>
      </div>

      {/* List */}
      {quizzes.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-400 text-sm">No quizzes yet.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 cursor-pointer"
          >
            Create your first quiz →
          </button>
        </div>
      ) : (
        <ul className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800 overflow-hidden">
          {quizzes.map((q) => {
            const assigned = assignedCount[q.id] ?? 0
            const attempts = attemptCount[q.id] ?? 0
            const categoryName = q.category_id ? categoryNameById[q.category_id] : null
            return (
              <li key={q.id} className="px-5 py-4 hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-zinc-100">{q.title}</h3>
                      {categoryName && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{categoryName}</span>
                      )}
                    </div>
                    {q.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{q.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 flex-wrap">
                      <span>{q.questions.length} question{q.questions.length !== 1 ? 's' : ''}</span>
                      <span>Passing: {q.passing_score}%</span>
                      <span>{assigned} assigned</span>
                      <span>{attempts} attempt{attempts !== 1 ? 's' : ''}</span>
                      <span className="text-zinc-600">Updated {fmtDate(q.updated_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setAssigning(q)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(q)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(q)}
                      disabled={deleting === q.id}
                      className="px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-red-500 hover:text-red-400 text-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {deleting === q.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Modals */}
      {showCreate && (
        <QuizModal existing={null} categories={categories} onClose={() => setShowCreate(false)} />
      )}
      {editing && (
        <QuizModal existing={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
      {assigning && (
        <AssignQuizModal
          quiz={assigning}
          employees={employees}
          roles={roles}
          userRoles={userRoles}
          onClose={() => setAssigning(null)}
        />
      )}
    </>
  )
}
