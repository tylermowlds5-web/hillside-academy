import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CertTopBar from '../CertTopBar'
import { loadCertStates, type CertProgramState } from '@/lib/certs'
import { fmtDate } from '@/lib/format-date'

function StatusBadge({ state }: { state: CertProgramState }) {
  if (state.status === 'certified') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-semibold text-emerald-700">
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
        </svg>
        Certified
      </span>
    )
  }
  if (state.status === 'expired') {
    return (
      <span className="inline-flex items-center rounded-full bg-burgundy/10 px-3 py-1 text-xs font-semibold text-burgundy">
        Expired — renew
      </span>
    )
  }
  if (state.status === 'in_progress') {
    return (
      <span className="inline-flex items-center rounded-full bg-plum/10 px-3 py-1 text-xs font-semibold text-plum/80">
        In progress
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-plum/15 px-3 py-1 text-xs font-semibold text-plum/50">
      Not started
    </span>
  )
}

function fmtTotalMinutes(state: CertProgramState) {
  const mins = state.modules.reduce((sum, m) => sum + (m.minutes ?? 0), 0)
  if (mins === 0) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

function ProgramCard({ state }: { state: CertProgramState }) {
  const { program, modules, completedCount } = state
  const pct = modules.length ? Math.round((completedCount / modules.length) * 100) : 0
  const time = fmtTotalMinutes(state)

  return (
    <Link
      href={`/certs/${program.id}`}
      className="group flex flex-col rounded-2xl border border-plum/10 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-plum/20 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <StatusBadge state={state} />
      </div>

      <h2 className="mt-4 font-serif text-xl font-semibold leading-snug text-plum group-hover:text-plum-dark">
        {program.name}
      </h2>
      {program.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-plum/60">
          {program.description}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-plum/50">
        <span>{modules.length} module{modules.length === 1 ? '' : 's'}</span>
        {time && (
          <>
            <span aria-hidden="true">·</span>
            <span>{time}</span>
          </>
        )}
        {program.validity_months && (
          <>
            <span aria-hidden="true">·</span>
            <span>Valid {program.validity_months} mo</span>
          </>
        )}
      </div>

      <div className="mt-auto pt-5">
        {state.status === 'certified' && state.award ? (
          <p className="text-xs font-medium text-plum/50">
            Earned {fmtDate(state.award.earned_at)}
            {state.award.expires_at && <> · renews by {fmtDate(state.award.expires_at)}</>}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-plum/10">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-plum/60">
              {completedCount}/{modules.length}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

export default async function CertCatalogPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const states = await loadCertStates(supabase, user.id)

  return (
    <>
      <CertTopBar title="Certification Center" />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Official Credentials
          </p>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-plum sm:text-4xl">
            Earn your Hillside certifications
          </h1>
          <p className="mt-3 text-base leading-relaxed text-plum/60">
            Structured programs that certify you on the Hillside standard. Complete every
            module, pass the exam, and your credential is added to your record.
          </p>
        </div>

        {states.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-plum/20 bg-white/60 p-10 text-center">
            <p className="font-serif text-lg font-semibold text-plum/70">
              No certification programs yet
            </p>
            <p className="mt-2 text-sm text-plum/50">
              Programs will appear here as soon as they&apos;re published.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {states.map((state) => (
              <ProgramCard key={state.program.id} state={state} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
