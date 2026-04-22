'use client'

import type { Profile, JobRole, UserJobRole } from '@/lib/types'

interface Props {
  employees: Profile[]
  roles: JobRole[]
  userRoles: UserJobRole[]
  selected: Set<string> // selected employee IDs
  onChange: (next: Set<string>) => void
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
}: Props) {
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
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-emerald-400">{selected.size}</span>
          <span className="text-zinc-500"> of {employees.length} employee{employees.length === 1 ? '' : 's'} selected</span>
        </p>
        {employees.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              Select all
            </button>
            <span className="text-zinc-700">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Assign by Role ─────────────────────────────────────────────── */}
      {roles.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
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
                    fully
                      ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-400'
                      : partial
                      ? 'bg-emerald-500/20 border-emerald-700 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-500'
                  }`}
                >
                  {fully && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  <span>{r.name}</span>
                  <span className={`text-[10px] ${fully ? 'text-white/80' : 'text-zinc-500'}`}>
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
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Assign by Individual
        </p>
        {employees.length === 0 ? (
          <p className="text-sm text-zinc-500">No employees found.</p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto border border-zinc-800 rounded-lg p-1">
            {employees.map((emp) => {
              const checked = selected.has(emp.id)
              const empRoleIds = rolesByEmp.get(emp.id) ?? []
              return (
                <label
                  key={emp.id}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                    checked ? 'bg-emerald-500/10' : 'hover:bg-zinc-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEmployee(emp.id)}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="w-7 h-7 rounded-full bg-emerald-900 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-emerald-400">
                      {(emp.full_name ?? emp.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {emp.full_name ?? emp.email}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {emp.full_name && (
                        <span className="text-xs text-zinc-500 truncate">{emp.email}</span>
                      )}
                      {empRoleIds.length > 0 && (
                        <>
                          {empRoleIds.map((rid) => (
                            <span
                              key={rid}
                              className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded"
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
