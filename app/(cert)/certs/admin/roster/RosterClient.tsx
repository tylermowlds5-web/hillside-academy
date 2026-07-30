'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setCertAwardExpiry } from '@/app/cert-admin-actions'
import { fmtDate } from '@/lib/format-date'

export type RosterStatus = 'active' | 'expiring' | 'expired' | 'revoked'

export type RosterRow = {
  awardId: string
  employeeName: string
  employeeEmail: string
  programId: string
  programName: string
  earnedAt: string
  expiresAt: string | null
  status: RosterStatus
  renewalOpen: boolean
}

const STATUS_LABEL: Record<RosterStatus, string> = {
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
  revoked: 'Revoked',
}

const STATUS_CHIP: Record<RosterStatus, string> = {
  active: 'bg-emerald-600/10 text-emerald-700',
  expiring: 'bg-amber-500/15 text-amber-700',
  expired: 'bg-burgundy/10 text-burgundy',
  revoked: 'bg-red-500/10 text-red-600',
}

type SortKey = 'name' | 'expires' | 'program'

// Inline expiry editor: date input + save + "never" clear. Saves via the
// admin action, then refreshes so status chips re-derive server-side.
function ExpiryEditor({ row }: { row: RosterRow }) {
  const router = useRouter()
  const initial = row.expiresAt ? row.expiresAt.slice(0, 10) : ''
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = value !== initial

  async function save(next: string) {
    setSaving(true)
    setError(null)
    try {
      // Date-only input → expire at end of that day UTC; blank → never expires.
      await setCertAwardExpiry(row.awardId, next === '' ? null : `${next}T23:59:59Z`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-plum/20 bg-white px-2 py-1.5 text-xs text-plum focus:outline-none focus:border-emerald-600"
        />
        {dirty && (
          <button
            type="button"
            onClick={() => save(value)}
            disabled={saving}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? '…' : 'Save'}
          </button>
        )}
        {row.expiresAt && !dirty && (
          <button
            type="button"
            onClick={() => save('')}
            disabled={saving}
            title="Clear — never expires (grandfather)"
            className="text-xs text-plum/50 hover:text-plum px-1.5 py-1"
          >
            Never
          </button>
        )}
        {!row.expiresAt && <span className="text-xs text-plum/40">never expires</span>}
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  )
}

export default function RosterClient({
  rows,
  programs,
}: {
  rows: RosterRow[]
  programs: { id: string; name: string }[]
}) {
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | RosterStatus>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = rows.filter((r) => {
      if (programFilter !== 'all' && r.programId !== programFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (q && !r.employeeName.toLowerCase().includes(q) && !r.employeeEmail.toLowerCase().includes(q))
        return false
      return true
    })
    return filtered.sort((a, b) => {
      if (sortKey === 'name') return a.employeeName.localeCompare(b.employeeName)
      if (sortKey === 'program') return a.programName.localeCompare(b.programName)
      // expires: soonest first; never-expires last
      const ax = a.expiresAt ? Date.parse(a.expiresAt) : Infinity
      const bx = b.expiresAt ? Date.parse(b.expiresAt) : Infinity
      return ax - bx
    })
  }, [rows, search, programFilter, statusFilter, sortKey])

  const counts = useMemo(() => {
    const c: Record<RosterStatus, number> = { active: 0, expiring: 0, expired: 0, revoked: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees…"
          className="w-56 rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum placeholder-plum/40 focus:outline-none focus:border-emerald-600"
        />
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum focus:outline-none focus:border-emerald-600"
        >
          <option value="all">All certifications</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | RosterStatus)}
          className="rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum focus:outline-none focus:border-emerald-600"
        >
          <option value="all">All statuses ({rows.length})</option>
          <option value="active">Active ({counts.active})</option>
          <option value="expiring">Expiring soon ({counts.expiring})</option>
          <option value="expired">Expired ({counts.expired})</option>
          <option value="revoked">Revoked ({counts.revoked})</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum focus:outline-none focus:border-emerald-600"
        >
          <option value="name">Sort: Employee</option>
          <option value="expires">Sort: Expiration (soonest)</option>
          <option value="program">Sort: Certification</option>
        </select>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-plum/20 px-4 py-10 text-center">
          <p className="text-sm text-plum/50">
            {rows.length === 0
              ? 'No certifications have been earned yet.'
              : 'Nothing matches these filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-plum/10 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-tan text-left">
                <th className="px-4 py-3 font-semibold text-plum/70">Employee</th>
                <th className="px-4 py-3 font-semibold text-plum/70">Certification</th>
                <th className="px-4 py-3 font-semibold text-plum/70">Status</th>
                <th className="px-4 py-3 font-semibold text-plum/70 whitespace-nowrap">Earned</th>
                <th className="px-4 py-3 font-semibold text-plum/70 whitespace-nowrap">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-plum/10">
              {visible.map((r) => (
                <tr key={r.awardId} className="bg-white align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-plum whitespace-nowrap">{r.employeeName}</p>
                    {r.employeeEmail && (
                      <p className="text-xs text-plum/50">{r.employeeEmail}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-plum/80">{r.programName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.renewalOpen && (
                      <p className="mt-1 text-[11px] text-plum/50">renewal in progress</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-plum/70 whitespace-nowrap">{fmtDate(r.earnedAt)}</td>
                  <td className="px-4 py-3">
                    <ExpiryEditor row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
