import Link from 'next/link'
import CertTopBar from '../CertTopBar'
import { PLACEHOLDER_PROGRAMS, programProgress, totalMinutes, type PlaceholderProgram } from './placeholder-data'

// ── PLACEHOLDER PAGE — Step 3 look review. Dummy data, no DB reads. ──────

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

function StatusBadge({ program }: { program: PlaceholderProgram }) {
  if (program.status === 'certified') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-semibold text-emerald-700">
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
        </svg>
        Certified
      </span>
    )
  }
  if (program.status === 'in_progress') {
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

function ProgramCard({ program }: { program: PlaceholderProgram }) {
  const progress = programProgress(program)
  const pct = Math.round((progress.completed / progress.total) * 100)

  return (
    <Link
      href={`/certs/${program.id}`}
      className="group flex flex-col rounded-2xl border border-plum/10 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-plum/20 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <StatusBadge program={program} />
        {program.required && (
          <span className="inline-flex items-center rounded-full border border-burgundy/30 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-burgundy">
            Required
          </span>
        )}
      </div>

      <h2 className="mt-4 font-serif text-xl font-semibold leading-snug text-plum group-hover:text-plum-dark">
        {program.name}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-plum/60">{program.tagline}</p>

      <div className="mt-5 flex items-center gap-4 text-xs font-medium text-plum/50">
        <span>{program.modules.length} modules</span>
        <span aria-hidden="true">·</span>
        <span>{fmtHours(totalMinutes(program))}</span>
        {program.validityMonths && (
          <>
            <span aria-hidden="true">·</span>
            <span>Valid {program.validityMonths} mo</span>
          </>
        )}
      </div>

      <div className="mt-auto pt-5">
        {program.status === 'certified' ? (
          <p className="text-xs font-medium text-plum/50">
            Earned {program.earnedAt} · renews by {program.expiresAt}
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
              {progress.completed}/{progress.total}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function CertCatalogPage() {
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

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PLACEHOLDER_PROGRAMS.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      </main>
    </>
  )
}
