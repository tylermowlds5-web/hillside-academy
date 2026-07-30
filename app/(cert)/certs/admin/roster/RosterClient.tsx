'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  setCertAwardExpiry,
  grantCertAward,
  revokeCertAward,
  deleteCertAward,
} from '@/app/cert-admin-actions'
import { fmtDate } from '@/lib/format-date'

export type RosterStatus = 'active' | 'expiring' | 'expired' | 'revoked'

export type RosterCert = {
  awardId: string
  programId: string
  programName: string
  earnedAt: string
  expiresAt: string | null
  status: RosterStatus
  adminGranted: boolean
  renewalOpen: boolean
}

export type RosterEmployee = {
  userId: string
  name: string
  email: string
  isAdmin: boolean
  certs: RosterCert[]
}

export type RosterProgram = { id: string; name: string; validityMonths: number | null }

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

type StatusFilter = 'all' | RosterStatus | 'none'
type SortKey = 'name' | 'expires'

function dateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

// Date-only inputs → stable instants: earned at midday UTC (renders the same
// calendar date in Pacific), expirations at end-of-day UTC.
const earnedIso = (d: string) => `${d}T12:00:00Z`
const expiresIso = (d: string) => `${d}T23:59:59Z`

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

// ── Inline expiry editor (unchanged behavior) ─────────────────────────────

function ExpiryEditor({ cert }: { cert: RosterCert }) {
  const router = useRouter()
  const initial = dateOnly(cert.expiresAt)
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = value !== initial

  async function save(next: string) {
    setSaving(true)
    setError(null)
    try {
      await setCertAwardExpiry(cert.awardId, next === '' ? null : expiresIso(next))
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
        {cert.expiresAt && !dirty && (
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
        {!cert.expiresAt && <span className="text-xs text-plum/40">never expires</span>}
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  )
}

// ── One cert sub-row ──────────────────────────────────────────────────────

function CertRow({ cert }: { cert: RosterCert }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-plum/5 px-3 py-2.5">
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium text-plum">{cert.programName}</p>
        <p className="text-[11px] text-plum/50">
          Earned {fmtDate(cert.earnedAt)}
          {cert.adminGranted && ' · granted by admin'}
          {cert.renewalOpen && ' · renewal in progress'}
        </p>
      </div>
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP[cert.status]}`}>
        {STATUS_LABEL[cert.status]}
      </span>
      <ExpiryEditor cert={cert} />
      <div className="flex items-center gap-1">
        {cert.status !== 'revoked' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(`Revoke ${cert.programName}? The record is kept and marked revoked; it will not come back automatically.`))
                run(() => revokeCertAward(cert.awardId))
            }}
            className="rounded px-2 py-1.5 text-xs text-burgundy hover:bg-burgundy/10 disabled:opacity-50"
          >
            Revoke
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete this ${cert.programName} record entirely? This cannot be undone.`))
              run(() => deleteCertAward(cert.awardId))
          }}
          className="rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {error && <p className="w-full text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  )
}

// ── Grant form (per employee) ─────────────────────────────────────────────

function GrantForm({
  employee,
  programs,
  onDone,
}: {
  employee: RosterEmployee
  programs: RosterProgram[]
  onDone: () => void
}) {
  const router = useRouter()
  const held = new Set(employee.certs.map((c) => c.programId))
  const available = programs.filter((p) => !held.has(p.id))
  const today = new Date().toISOString().slice(0, 10)

  const [programId, setProgramId] = useState(available[0]?.id ?? '')
  const [earned, setEarned] = useState(today)
  const [expires, setExpires] = useState(() => {
    const v = available[0]?.validityMonths
    return v ? addMonths(today, v) : ''
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickProgram(id: string) {
    setProgramId(id)
    const v = programs.find((p) => p.id === id)?.validityMonths
    setExpires(v ? addMonths(earned || today, v) : '')
  }

  async function handleGrant() {
    if (!programId) { setError('Pick a certification'); return }
    if (!earned) { setError('Pick an earned date'); return }
    setBusy(true)
    setError(null)
    try {
      await grantCertAward({
        userId: employee.userId,
        programId,
        earnedAt: earnedIso(earned),
        expiresAt: expires === '' ? null : expiresIso(expires),
      })
      onDone()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grant failed')
      setBusy(false)
    }
  }

  if (available.length === 0) {
    return (
      <p className="rounded-lg bg-plum/5 px-3 py-2.5 text-xs text-plum/50">
        {employee.name} already holds every certification.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-plum/60">Certification</label>
          <select
            value={programId}
            onChange={(e) => pickProgram(e.target.value)}
            className="rounded-lg border border-plum/20 bg-white px-2 py-1.5 text-xs text-plum focus:outline-none focus:border-emerald-600"
          >
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-plum/60">Earned</label>
          <input
            type="date"
            value={earned}
            onChange={(e) => setEarned(e.target.value)}
            className="rounded-lg border border-plum/20 bg-white px-2 py-1.5 text-xs text-plum focus:outline-none focus:border-emerald-600"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-plum/60">
            Expires <span className="text-plum/40">(blank = never)</span>
          </label>
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="rounded-lg border border-plum/20 bg-white px-2 py-1.5 text-xs text-plum focus:outline-none focus:border-emerald-600"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGrant}
            disabled={busy}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Granting…' : 'Grant'}
          </button>
          <button type="button" onClick={onDone} className="text-xs text-plum/50 hover:text-plum">
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  )
}

// ── Main roster ───────────────────────────────────────────────────────────

export default function RosterClient({
  employees,
  programs,
}: {
  employees: RosterEmployee[]
  programs: RosterProgram[]
}) {
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [grantingFor, setGrantingFor] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = employees.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !e.email.toLowerCase().includes(q)) return false
      if (programFilter !== 'all' && !e.certs.some((c) => c.programId === programFilter)) return false
      if (statusFilter === 'none') return e.certs.length === 0
      if (statusFilter !== 'all' && !e.certs.some((c) => c.status === statusFilter)) return false
      return true
    })
    const minExpiry = (e: RosterEmployee) => {
      const times = e.certs
        .filter((c) => c.expiresAt && c.status !== 'revoked')
        .map((c) => Date.parse(c.expiresAt!))
      return times.length ? Math.min(...times) : Infinity
    }
    return filtered.sort((a, b) =>
      sortKey === 'name' ? a.name.localeCompare(b.name) : minExpiry(a) - minExpiry(b)
    )
  }, [employees, search, programFilter, statusFilter, sortKey])

  const totalCerts = employees.reduce((n, e) => n + e.certs.length, 0)

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
          <option value="all">All certifications ({totalCerts})</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum focus:outline-none focus:border-emerald-600"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
          <option value="none">No certs yet</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum focus:outline-none focus:border-emerald-600"
        >
          <option value="name">Sort: Employee</option>
          <option value="expires">Sort: Expiration (soonest)</option>
        </select>
      </div>

      {/* Employee list */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-plum/20 px-4 py-10 text-center">
          <p className="text-sm text-plum/50">Nothing matches these filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((e) => (
            <section key={e.userId} className="rounded-2xl border border-plum/10 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-plum">
                    {e.name}
                    {e.isAdmin && (
                      <span className="rounded-full bg-plum/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-plum/60">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-plum/50">{e.email}</p>
                </div>
                {grantingFor !== e.userId && (
                  <button
                    type="button"
                    onClick={() => setGrantingFor(e.userId)}
                    className="rounded-full border border-emerald-600/40 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600/5"
                  >
                    + Grant cert
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {grantingFor === e.userId && (
                  <GrantForm employee={e} programs={programs} onDone={() => setGrantingFor(null)} />
                )}
                {e.certs.length === 0 ? (
                  grantingFor !== e.userId && (
                    <p className="text-xs text-plum/40">No certifications yet.</p>
                  )
                ) : (
                  e.certs.map((c) => <CertRow key={c.awardId} cert={c} />)
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
