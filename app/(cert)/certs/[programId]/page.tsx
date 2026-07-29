import Link from 'next/link'
import { notFound } from 'next/navigation'
import CertTopBar from '../../CertTopBar'
import {
  placeholderProgram,
  programProgress,
  totalMinutes,
  type PlaceholderModule,
} from '../placeholder-data'

// ── PLACEHOLDER PAGE — Step 3 look review. Dummy data, no DB reads. ──────

function KindLabel({ kind }: { kind: PlaceholderModule['kind'] }) {
  const label = kind === 'exam' ? 'Certification exam' : kind === 'quiz' ? 'Knowledge check' : 'Video lesson'
  return <span>{label}</span>
}

function ModuleRow({
  module,
  index,
  programId,
}: {
  module: PlaceholderModule
  index: number
  programId: string
}) {
  const n = index + 1
  const locked = module.state === 'locked'
  const completed = module.state === 'completed'
  const current = module.state === 'current'

  const marker = completed ? (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  ) : locked ? (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-plum/5 text-plum/30">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </span>
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-emerald-600 bg-white text-sm font-bold text-emerald-700">
      {n}
    </span>
  )

  const inner = (
    <div
      className={
        'flex items-center gap-4 rounded-xl border p-4 sm:p-5 transition-colors ' +
        (current
          ? 'border-emerald-600/40 bg-white shadow-sm'
          : locked
            ? 'border-plum/5 bg-white/50'
            : 'border-plum/10 bg-white hover:border-plum/20')
      }
    >
      {marker}
      <div className="min-w-0 flex-1">
        <p className={'font-medium leading-snug ' + (locked ? 'text-plum/40' : 'text-plum')}>
          {module.title}
        </p>
        <p className={'mt-0.5 text-xs ' + (locked ? 'text-plum/30' : 'text-plum/50')}>
          <KindLabel kind={module.kind} /> · {module.minutes} min
          {module.blurb ? <> — {module.blurb}</> : null}
        </p>
      </div>
      {current && (
        <span className="hidden shrink-0 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white sm:inline-flex">
          Continue
        </span>
      )}
      {locked && (
        <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wider text-plum/30 sm:inline">
          Locked
        </span>
      )}
    </div>
  )

  // Locked modules aren't clickable — the lock state is the point.
  if (locked) return <li>{inner}</li>

  return (
    <li>
      <Link href={`/certs/${programId}/modules/${module.id}`} className="block">
        {inner}
      </Link>
    </li>
  )
}

export default async function ProgramOverviewPage(props: {
  params: Promise<{ programId: string }>
}) {
  const { programId } = await props.params
  const program = placeholderProgram(programId)
  if (!program) notFound()

  const progress = programProgress(program)
  const pct = Math.round((progress.completed / progress.total) * 100)
  const mins = totalMinutes(program)

  return (
    <>
      <CertTopBar title={program.name} progress={progress} backHref="/certs" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Program hero */}
        <div className="rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
              Certification Program
            </p>
            {program.required && (
              <span className="inline-flex items-center rounded-full border border-burgundy/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-burgundy">
                Required
              </span>
            )}
          </div>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-plum sm:text-3xl">
            {program.name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-plum/60 sm:text-base">
            {program.description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-plum/50">
            <span className="font-medium">{progress.total} modules</span>
            <span className="font-medium">
              {Math.floor(mins / 60)} hr {mins % 60} min total
            </span>
            <span className="font-medium">
              {program.validityMonths
                ? `Credential valid ${program.validityMonths} months`
                : 'Credential does not expire'}
            </span>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-plum/10">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-semibold text-plum/70">{pct}%</span>
          </div>
        </div>

        {/* Module list with lock states */}
        <div className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
            Modules
          </h2>
          <ul className="mt-4 space-y-3">
            {program.modules.map((module, i) => (
              <ModuleRow key={module.id} module={module} index={i} programId={program.id} />
            ))}
          </ul>
          <p className="mt-4 text-xs text-plum/40">
            Modules unlock in order — complete each one to open the next.
          </p>
        </div>
      </main>
    </>
  )
}
