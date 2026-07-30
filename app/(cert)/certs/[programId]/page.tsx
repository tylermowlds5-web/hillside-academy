import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CertTopBar from '../../CertTopBar'
import { loadProgramState, topBarProgress, type CertModule } from '@/lib/certs'
import { fmtDate } from '@/lib/format-date'

function kindLabel(mod: CertModule) {
  if (mod.kind === 'quiz') return 'Certification quiz'
  if (mod.kind === 'path') return 'Learning path'
  if (mod.kind === 'lesson') return mod.hasQuizBank ? 'Reading + quiz' : 'Reading'
  return mod.hasQuizBank ? 'Video lesson + quiz' : 'Video lesson'
}

function moduleMeta(mod: CertModule) {
  const parts: string[] = [kindLabel(mod)]
  if (mod.minutes) parts.push(`${mod.minutes} min`)
  if (mod.kind === 'quiz' && mod.quizQuestionCount) parts.push(`${mod.quizQuestionCount} questions`)
  if (mod.kind === 'path' && mod.pathVideoCount)
    parts.push(`${mod.pathCompletedCount}/${mod.pathVideoCount} videos complete`)
  return parts.join(' · ')
}

function ModuleRow({
  mod,
  index,
  programId,
  isCurrent,
}: {
  mod: CertModule
  index: number
  programId: string
  isCurrent: boolean
}) {
  const locked = !mod.unlocked

  const marker = mod.completed ? (
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
      {index + 1}
    </span>
  )

  const inner = (
    <div
      className={
        'flex items-center gap-4 rounded-xl border p-4 sm:p-5 transition-colors ' +
        (isCurrent
          ? 'border-emerald-600/40 bg-white shadow-sm'
          : locked
            ? 'border-plum/5 bg-white/50'
            : 'border-plum/10 bg-white hover:border-plum/20')
      }
    >
      {marker}
      <div className="min-w-0 flex-1">
        <p className={'font-medium leading-snug ' + (locked ? 'text-plum/40' : 'text-plum')}>
          {mod.title}
        </p>
        <p className={'mt-0.5 text-xs ' + (locked ? 'text-plum/30' : 'text-plum/50')}>
          {moduleMeta(mod)}
        </p>
      </div>
      {isCurrent && !locked && (
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

  // Locked modules are not links — and the module page re-checks the same
  // gate server-side, so hand-typed URLs bounce too.
  if (locked) return <li>{inner}</li>

  return (
    <li>
      <Link href={`/certs/${programId}/modules/${mod.requirementId}`} className="block">
        {inner}
      </Link>
    </li>
  )
}

export default async function ProgramOverviewPage(props: {
  params: Promise<{ programId: string }>
}) {
  const { programId } = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await loadProgramState(supabase, user.id, programId)
  if (!state) notFound()

  const { program, modules, completedCount, award } = state
  const pct = modules.length ? Math.round((completedCount / modules.length) * 100) : 0
  const totalMins = modules.reduce((sum, m) => sum + (m.minutes ?? 0), 0)
  const currentIndex = modules.findIndex((m) => !m.completed && m.unlocked)

  return (
    <>
      <CertTopBar title={program.name} progress={topBarProgress(state)} backHref="/certs" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {state.status === 'certified' && award && (
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div>
              <p className="font-serif font-semibold text-plum">
                Certified — earned {fmtDate(award.earned_at)}
              </p>
              {award.expires_at && (
                <p className="text-xs text-plum/60">Renew by {fmtDate(award.expires_at)}</p>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Certification Program
          </p>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-plum sm:text-3xl">
            {program.name}
          </h1>
          {program.description && (
            <p className="mt-3 text-sm leading-relaxed text-plum/60 sm:text-base">
              {program.description}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-plum/50">
            <span className="font-medium">
              {modules.length} module{modules.length === 1 ? '' : 's'}
            </span>
            {totalMins > 0 && (
              <span className="font-medium">
                {Math.floor(totalMins / 60) > 0 ? `${Math.floor(totalMins / 60)} hr ` : ''}
                {totalMins % 60} min total
              </span>
            )}
            <span className="font-medium">
              {program.validity_months
                ? `Credential valid ${program.validity_months} months`
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

        <div className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
            Modules
          </h2>
          {modules.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-plum/20 bg-white/60 p-6 text-center text-sm text-plum/50">
              This program has no modules yet.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-3">
                {modules.map((mod, i) => (
                  <ModuleRow
                    key={mod.requirementId}
                    mod={mod}
                    index={i}
                    programId={program.id}
                    isCurrent={i === currentIndex}
                  />
                ))}
              </ul>
              <p className="mt-4 text-xs text-plum/40">
                Modules unlock in order — complete each one to open the next.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  )
}
