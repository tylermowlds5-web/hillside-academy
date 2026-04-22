'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JobRole, UserJobRole } from '@/lib/types'
import { createJobRole, updateJobRole, deleteJobRole } from '@/app/actions'

interface Props {
  roles: JobRole[]
  userRoles: UserJobRole[]
}

export default function RolesManagement({ roles, userRoles }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<JobRole | null>(null)
  const [error, setError] = useState<string | null>(null)

  const memberCountByRole = new Map<string, number>()
  for (const ur of userRoles) {
    memberCountByRole.set(ur.role_id, (memberCountByRole.get(ur.role_id) ?? 0) + 1)
  }

  async function handleDelete(role: JobRole) {
    const count = memberCountByRole.get(role.id) ?? 0
    if (
      !confirm(
        `Delete role "${role.name}"?${count > 0 ? `\n\nThis role is currently assigned to ${count} employee${count === 1 ? '' : 's'}. Those assignments will be removed.` : ''}`
      )
    )
      return
    setError(null)
    try {
      await deleteJobRole(role.id)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Roles</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Group employees (Crew Lead, Crew Member, Chemical Applicator, etc.) for faster assignments
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          Add Role
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {roles.length === 0 ? (
        <p className="text-sm text-zinc-500 py-2">No roles yet. Click "Add Role" to create one.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const count = memberCountByRole.get(r.id) ?? 0
            return (
              <div
                key={r.id}
                className="inline-flex items-stretch rounded-lg border border-zinc-800 overflow-hidden"
              >
                <div className="px-3 py-1.5 bg-zinc-800">
                  <span className="text-sm text-zinc-100 font-medium">{r.name}</span>
                  <span className="text-[10px] text-zinc-500 ml-2">{count}</span>
                </div>
                <button
                  onClick={() => setEditing(r)}
                  className="px-2 bg-zinc-800/60 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                  title="Edit role"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  className="px-2 bg-zinc-800/60 hover:bg-red-500/20 text-xs text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Delete role"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && (
        <RoleFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); router.refresh() }}
        />
      )}

      {editing && (
        <RoleFormModal
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
        />
      )}
    </section>
  )
}

function RoleFormModal({
  role,
  onClose,
  onSaved,
}: {
  role?: JobRole
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!role

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError(null)
    setSaving(true)
    try {
      if (isEdit && role) {
        await updateJobRole(role.id, {
          name: name.trim(),
          description: description.trim() || null,
        })
      } else {
        await createJobRole({
          name: name.trim(),
          description: description.trim() || null,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-md shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-50 mb-4">{isEdit ? 'Edit Role' : 'Add Role'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} required
              placeholder="e.g. Crew Lead" autoFocus
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Optional"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm cursor-pointer">
            Cancel
          </button>
          <button
            type="submit" disabled={saving || !name.trim()}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium cursor-pointer"
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
