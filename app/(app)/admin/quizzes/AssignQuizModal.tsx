'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, JobRole, UserJobRole, StandaloneQuiz } from '@/lib/types'
import { assignStandaloneQuiz } from '@/app/actions'
import EmployeeSelector from '../EmployeeSelector'

export default function AssignQuizModal({
  quiz,
  employees,
  roles,
  userRoles,
  onClose,
}: {
  quiz: StandaloneQuiz
  employees: Profile[]
  roles: JobRole[]
  userRoles: UserJobRole[]
  onClose: () => void
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dueDate, setDueDate] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (selected.size === 0) { setError('Select at least one employee'); return }

    setPending(true)
    const data = new FormData()
    data.set('quiz_id', quiz.id)
    if (dueDate) data.set('due_date', dueDate)
    for (const id of selected) data.append('user_ids', id)

    try {
      const res = await assignStandaloneQuiz(data)
      if (!res.ok) {
        setError(res.error ?? 'Failed to assign')
        // Rows may have been saved (e.g. emails failed) — refresh so the list
        // reflects reality, but keep the modal open so the admin sees the error.
        if (res.saved) router.refresh()
        return
      }
      router.refresh()
      onClose()
    } catch (err) {
      // Fallback: the action returns errors rather than throwing, but guard
      // against an unexpected throw (e.g. network failure reaching the action).
      setError(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-50">Assign Quiz</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{quiz.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Employees <span className="text-red-500">*</span>
            </label>
            <EmployeeSelector
              employees={employees}
              roles={roles}
              userRoles={userRoles}
              selected={selected}
              onChange={setSelected}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Due date <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors [color-scheme:dark]"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {pending ? 'Assigning…' : 'Assign Quiz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
