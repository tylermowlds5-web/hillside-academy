'use client'

import type { Profile, JobRole, UserJobRole } from '@/lib/types'

interface Props {
  employees: Profile[]
  roles: JobRole[]
  userRoles: UserJobRole[]
  selected: Set<string> // selected employee IDs
  onChange: (next: Set<string>) => void
  // Render on the cert area's light tan/plum palette instead of the default
  // dark zinc used by the HU admin screens.
  light?: boolean
}

// ── Theming ──────────────────────────────────────────────────────────────
// DARK values are the original classes byte-for-byte, so the existing HU
// admin screens (paths, assign, quiz modals) are visually unchanged.

type ESTheme = {
  countText: string
  countNum: string
  muted: string
  linkPrimary: string
  dot: string
  linkQuiet: string
  chipOn: string
  chipPartial: string
  chipOff: string
  chipCountOff: string
  listBorder: string
  rowChecked: string
  rowHover: string
  avatar: string
  avatarText: string
  name: string
  roleChip: string
}

const ES_DARK: ESTheme = {
  countText: 'text-zinc-300',
  countNum: 'text-emerald-400',
  muted: 'text-zinc-500',
  linkPrimary: 'text-emerald-400 hover:text-emerald-300',
  dot: 'text-zinc-700',
  linkQuiet: 'text-zinc-400 hover:text-zinc-200',
  chipOn: 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-400',
  chipPartial: 'bg-emerald-500/20 border-emerald-700 text-emerald-300 hover:bg-emerald-500/30',
  chipOff: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-500',
  chipCountOff: 'text-zinc-500',
  listBorder: 'border-zinc-800',
  rowChecked: 'bg-emerald-500/10',
  rowHover: 'hover:bg-zinc-800',
  avatar: 'bg-emerald-900',
  avatarText: 'text-emerald-400',
  name: 'text-zinc-100',
  roleChip: 'bg-zinc-800 text-zinc-400',
}

const ES_LIGHT: ESTheme = {
  countText: 'text-plum/70',
  countNum: 'text-emerald-700',
  muted: 'text-plum/50',
  linkPrimary: 'text-emerald-700 hover:text-emerald-800',
  dot: 'text-plum/30',
  linkQuiet: 'text-plum/60 hover:text-plum',
  chipOn: 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700',
  chipPartial: 'bg-emerald-600/10 border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/20',
  chipOff: 'bg-white border-plum/20 text-plum/80 hover:border-plum/40',
  chipCountOff: 'text-plum/50',
  listBorder: 'border-plum/15',
  rowChecked: 'bg-emerald-600/10',
  rowHover: 'hover:bg-plum/5',
  avatar: 'bg-emerald-600/15',
  avatarText: 'text-emerald-700',
  name: 'text-plum',
  roleChip: 'bg-plum/10 text-plum/60',
}

/**
 * Two-section employee selector:
 *  - Assign by Role: each role is a button that toggles selection of all
 *    employees who have that role.
 *  - Assign by Individual: each employee has a checkbox; role chips below
 *    name for context.
 * Both interact with the same `selected` set so they stay in sync.
 */
export default function EmployeeSelector({
  employees,
  roles,
  userRoles,
  selected,
  onChange,
  light = false,
}: Props) {
  const t = light ? ES_LIGHT : ES_DARK

  // Only count active employees (passed as `employees`) toward role memberships
  const activeEmpIds = new Set(employees.map((e) => e.id))

  const empIdsByRole = new Map<string, string[]>()
  for (const ur of userRoles) {
    if (!activeEmpIds.has(ur.user_id)) continue
    if (!empIdsByRole.has(ur.role_id)) empIdsByRole.set(ur.role_id, [])
    empIdsByRole.get(ur.role_id)!.push(ur.user_id)
  }

  const rolesByEmp = new Map<string, string[]>()
  for (const ur of userRoles) {
    if (!activeEmpIds.has(ur.user_id)) continue
    if (!rolesByEmp.has(ur.user_id)) rolesByEmp.set(ur.user_id, [])
    rolesByEmp.get(ur.user_id)!.push(ur.role_id)
  }

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]))

  function toggleEmployee(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  function toggleRole(roleId: string) {
    const ids = empIdsByRole.get(roleId) ?? []
    if (ids.length === 0) return
    const allSelected = ids.every((id) => selected.has(id))
    const next = new Set(selected)
    if (allSelected) {
      for (const id of ids) next.delete(id)
    } else {
      for (const id of ids) next.add(id)
    }
    onChange(next)
  }

  function selectAll() {
    onChange(new Set(employees.map((e) => e.id)))
  }

  function clearAll() {
    onChange(new Set())
  }

  function isRoleFullySelected(roleId: string): boolean {
    const ids = empIdsByRole.get(roleId) ?? []
    if (ids.length === 0) return false
    return ids.every((id) => selected.has(id))
  }

  function isRolePartiallySelected(roleId: string): boolean {
    const ids = empIdsByRole.get(roleId) ?? []
    if (ids.length === 0) return false
    const some = ids.some((id) => selected.has(id))
    return some && !ids.every((id) => selected.has(id))
  }

  return (
    <div className="space-y-4">
      {/* Count + quick actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className={`text-sm ${t.countText}`}>
          <span className={`font-semibold ${t.countNum}`}>{selected.size}</span>
          <span className={t.muted}> of {employees.length} employee{employees.length === 1 ? '' : 's'} selected</span>
        </p>
        {employees.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className={`${t.linkPrimary} cursor-pointer`}
            >
              Select all
            </button>
            <span className={t.dot}>·</span>
            <button
              type="button"
              onClick={clearAll}
              className={`${t.linkQuiet} cursor-pointer`}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Assign by Role ─────────────────────────────────────────────── */}
      {roles.length > 0 && (
        <div>
          <p className={`text-xs font-semibold ${t.muted} uppercase tracking-wider mb-2`}>
            Assign by Role
          </p>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => {
              const members = empIdsByRole.get(r.id) ?? []
              const fully = isRoleFullySelected(r.id)
              const partial = isRolePartiallySelected(r.id)
              const disabled = members.length === 0
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  disabled={disabled}
                  title={r.description ?? undefined}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                    fully ? t.chipOn : partial ? t.chipPartial : t.chipOff
                  }`}
                >
                  {fully && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  <span>{r.name}</span>
                  <span className={`text-[10px] ${fully ? 'text-white/80' : t.chipCountOff}`}>
                    {members.length}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Assign by Individual ──────────────────────────────────────── */}
      <div>
        <p className={`text-xs font-semibold ${t.muted} uppercase tracking-wider mb-2`}>
          Assign by Individual
        </p>
        {employees.length === 0 ? (
          <p className={`text-sm ${t.muted}`}>No employees found.</p>
        ) : (
          <div className={`space-y-1 max-h-72 overflow-y-auto border ${t.listBorder} rounded-lg p-1`}>
            {employees.map((emp) => {
              const checked = selected.has(emp.id)
              const empRoleIds = rolesByEmp.get(emp.id) ?? []
              return (
                <label
                  key={emp.id}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                    checked ? t.rowChecked : t.rowHover
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEmployee(emp.id)}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer flex-shrink-0"
                  />
                  <div className={`w-7 h-7 rounded-full ${t.avatar} flex items-center justify-center flex-shrink-0`}>
                    <span className={`text-xs font-semibold ${t.avatarText}`}>
                      {(emp.full_name ?? emp.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.name} truncate`}>
                      {emp.full_name ?? emp.email}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {emp.full_name && (
                        <span className={`text-xs ${t.muted} truncate`}>{emp.email}</span>
                      )}
                      {empRoleIds.length > 0 && (
                        <>
                          {empRoleIds.map((rid) => (
                            <span
                              key={rid}
                              className={`text-[10px] ${t.roleChip} px-1.5 py-0.5 rounded`}
                            >
                              {roleNameById.get(rid) ?? 'Role'}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
