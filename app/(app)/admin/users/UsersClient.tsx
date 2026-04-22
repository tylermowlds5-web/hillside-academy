'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, JobRole, UserJobRole } from '@/lib/types'
import { fmtDate, fmtTime } from '@/lib/format-date'
import {
  setUserActive,
  updateUserProfile,
  deleteUserAccount,
  createUserAccount,
  setUserJobRoles,
} from '@/app/actions'
import RolesManagement from './RolesManagement'

interface Props {
  users: Profile[]
  lastLoginByUser: Record<string, string>
  currentUserId: string
  roles: JobRole[]
  userRoles: UserJobRole[]
}

export default function UsersClient({ users, lastLoginByUser, currentUserId, roles, userRoles }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = users
    .filter((u) => {
      if (filter === 'active') return u.is_active
      if (filter === 'inactive') return !u.is_active
      return true
    })
    .filter((u) => {
      if (!search) return true
      const s = search.toLowerCase()
      return (
        (u.full_name ?? '').toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s)
      )
    })

  // Build user_id → role IDs map
  const roleIdsByUser = new Map<string, string[]>()
  for (const ur of userRoles) {
    if (!roleIdsByUser.has(ur.user_id)) roleIdsByUser.set(ur.user_id, [])
    roleIdsByUser.get(ur.user_id)!.push(ur.role_id)
  }
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]))

  async function handleToggleActive(u: Profile) {
    setError(null)
    setBusyId(u.id)
    try {
      await setUserActive(u.id, !u.is_active)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(u: Profile) {
    if (!confirm(`Delete ${u.full_name ?? u.email}? This permanently removes the user and all their progress data. This cannot be undone.`)) return
    setError(null)
    setBusyId(u.id)
    try {
      await deleteUserAccount(u.id)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-50">Users</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage employee and admin accounts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors"
        >
          Add User
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Roles management */}
      <RolesManagement roles={roles} userRoles={userRoles} />

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All users</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No users found.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-400 font-medium">Name</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Role</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">Joined</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.map((u) => {
                  const lastLogin = lastLoginByUser[u.id]
                  const isSelf = u.id === currentUserId
                  return (
                    <tr key={u.id} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-900 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-emerald-400">
                              {(u.full_name ?? u.email).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-zinc-100 font-medium truncate">{u.full_name ?? '—'}</p>
                            <p className="text-xs text-zinc-500 truncate sm:hidden">{u.email}</p>
                            {(roleIdsByUser.get(u.id) ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {(roleIdsByUser.get(u.id) ?? []).map((rid) => (
                                  <span key={rid} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                                    {roleNameById.get(rid) ?? 'Role'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {isSelf && (
                            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded flex-shrink-0">YOU</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300 hidden sm:table-cell">{u.email}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          u.role === 'admin' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell whitespace-nowrap">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell whitespace-nowrap">
                        {lastLogin ? (
                          <>
                            {fmtDate(lastLogin)}{' '}
                            <span className="text-zinc-600 text-xs">{fmtTime(lastLogin)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(u)}
                          className="text-xs text-zinc-400 hover:text-emerald-400 px-2 py-1 rounded hover:bg-zinc-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={busyId === u.id || isSelf}
                          title={isSelf ? 'Cannot deactivate your own account' : ''}
                          className={`text-xs px-2 py-1 rounded ml-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                            u.is_active
                              ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-500/10'
                              : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                          }`}
                        >
                          {busyId === u.id ? '…' : u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={busyId === u.id || isSelf}
                          title={isSelf ? 'Cannot delete your own account' : ''}
                          className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 ml-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            router.refresh()
          }}
        />
      )}

      {/* Edit user modal */}
      {editing && (
        <EditUserModal
          user={editing}
          isSelf={editing.id === currentUserId}
          roles={roles}
          initialRoleIds={roleIdsByUser.get(editing.id) ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ── Create user modal ────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'employee'>('employee')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) { setError('Email is required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setSaving(true)
    try {
      await createUserAccount({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-md shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-50 mb-4">Create User</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Full name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jane Smith"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@hillside.com"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Temporary password</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="at least 6 characters"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 font-mono" />
            <p className="text-xs text-zinc-600 mt-1">Share this with the employee — they can change it after signing in.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'employee')}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">{error}</div>}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !email.trim() || password.length < 6}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Edit user modal ──────────────────────────────────────────────────────

function EditUserModal({
  user,
  isSelf,
  roles,
  initialRoleIds,
  onClose,
  onSaved,
}: {
  user: Profile
  isSelf: boolean
  roles: JobRole[]
  initialRoleIds: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [role, setRole] = useState<'admin' | 'employee'>(user.role as 'admin' | 'employee')
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set(initialRoleIds))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleJobRole(id: string) {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await updateUserProfile(user.id, {
        full_name: fullName.trim(),
        role,
      })
      await setUserJobRoles(user.id, [...selectedRoleIds])
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSave} className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-md shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-50 mb-1">Edit User</h2>
        <p className="text-xs text-zinc-500 mb-4">{user.email}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Full name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'employee')}
              disabled={isSelf}
              title={isSelf ? 'You cannot change your own role' : ''}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60"
            >
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
            {isSelf && <p className="text-xs text-zinc-600 mt-1">You cannot change your own role.</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Job Roles</label>
            {roles.length === 0 ? (
              <p className="text-xs text-zinc-500">No roles defined yet. Create roles from the Roles section above.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto border border-zinc-800 rounded-lg p-1">
                {roles.map((r) => {
                  const checked = selectedRoleIds.has(r.id)
                  return (
                    <label
                      key={r.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                        checked ? 'bg-emerald-500/10' : 'hover:bg-zinc-800'
                      }`}
                    >
                      <input
                        type="checkbox" checked={checked} onChange={() => toggleJobRole(r.id)}
                        className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span className="text-sm text-zinc-200">{r.name}</span>
                      {r.description && <span className="text-xs text-zinc-500 truncate">— {r.description}</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          {error && <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">{error}</div>}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
