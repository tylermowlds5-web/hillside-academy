import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CertProgram } from '@/lib/types'

export default async function AdminCertsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: programs }, { data: reqCounts }, { data: assignCounts }] = await Promise.all([
    supabase.from('cert_programs').select('*').order('created_at').returns<CertProgram[]>(),
    supabase.from('cert_program_modules').select('program_id').returns<{ program_id: string }[]>(),
    supabase.from('cert_assignments').select('program_id').returns<{ program_id: string }[]>(),
  ])

  const moduleCount = new Map<string, number>()
  for (const r of reqCounts ?? []) moduleCount.set(r.program_id, (moduleCount.get(r.program_id) ?? 0) + 1)
  const assignedCount = new Map<string, number>()
  for (const a of assignCounts ?? []) assignedCount.set(a.program_id, (assignedCount.get(a.program_id) ?? 0) + 1)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-plum">Certifications</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/certs/admin/roster"
            className="px-4 py-2 rounded-full border border-plum/20 hover:border-plum/40 text-plum/80 text-sm font-semibold transition-colors"
          >
            Roster
          </Link>
          <Link
            href="/certs/admin/new"
            className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
          >
            + New Program
          </Link>
        </div>
      </div>

      {(programs ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-plum/10 px-4 py-10 text-center">
          <p className="text-sm text-plum/50">
            No certification programs yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(programs ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/certs/admin/${p.id}`}
              className="flex items-center gap-4 rounded-xl border border-plum/10 bg-white shadow-sm hover:border-plum/30 p-4 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-plum truncate">{p.name}</p>
                  {!p.is_active && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-plum/10 text-plum/50 px-2 py-0.5 rounded-full">
                      Inactive
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-plum/50 truncate mt-0.5">{p.description}</p>
                )}
              </div>
              <div className="text-right text-xs text-plum/50 flex-shrink-0">
                <p>{moduleCount.get(p.id) ?? 0} module{(moduleCount.get(p.id) ?? 0) === 1 ? '' : 's'}</p>
                <p className="mt-0.5">{assignedCount.get(p.id) ?? 0} assigned</p>
              </div>
              <svg className="w-4 h-4 text-plum/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
