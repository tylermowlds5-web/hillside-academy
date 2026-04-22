'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAssignment } from '@/app/actions'
import type { Profile, Video, JobRole, UserJobRole } from '@/lib/types'
import EmployeeSelector from '../EmployeeSelector'

export default function AssignForm({
  employees,
  videos,
  roles,
  userRoles,
}: {
  employees: Profile[]
  videos: Video[]
  roles: JobRole[]
  userRoles: UserJobRole[]
}) {
  const router = useRouter()
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (selectedEmployees.size === 0) {
      setError('Select at least one employee')
      return
    }

    setPending(true)
    const form = e.currentTarget
    const data = new FormData(form)
    for (const id of selectedEmployees) {
      data.append('user_ids', id)
    }

    try {
      await createAssignment(data)
      setSelectedEmployees(new Set())
      form.reset()
      setSuccess(true)
      router.refresh()
      setTimeout(() => setSuccess(false), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Video <span className="text-red-500">*</span>
        </label>
        <select
          name="video_id"
          required
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
        >
          <option value="">Select a video…</option>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Employees <span className="text-red-500">*</span>
        </label>
        <EmployeeSelector
          employees={employees}
          roles={roles}
          userRoles={userRoles}
          selected={selectedEmployees}
          onChange={setSelectedEmployees}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Due date <span className="text-zinc-500 font-normal">(optional)</span>
        </label>
        <input
          type="date"
          name="due_date"
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors [color-scheme:dark]"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-3 py-2.5 text-sm text-emerald-400 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Video assigned successfully.
        </div>
      )}

      <button
        type="submit"
        disabled={pending || employees.length === 0 || videos.length === 0}
        className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors cursor-pointer"
      >
        {pending ? 'Assigning…' : 'Assign Video'}
      </button>
    </form>
  )
}
