import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CertTopBar from '../../../../CertTopBar'
import { loadProgramState, requireUnlockedModule, topBarProgress } from '@/lib/certs'

// Module page. The gate lives in requireUnlockedModule (lib/certs.ts):
// a module renders ONLY if every prior requirement is genuinely complete for
// this user, re-derived from the database on every request — typing the URL
// of a locked module redirects to the program overview. 4b's submit actions
// must call the same gate before recording anything.
export default async function ModulePage(props: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const gate = await requireUnlockedModule(supabase, user.id, programId, moduleId)
  if (!gate) {
    // Either the program/module doesn't exist, or it's locked for this user.
    // Distinguish so bad links 404 while locked modules bounce to the overview.
    const state = await loadProgramState(supabase, user.id, programId)
    if (!state || !state.modules.some((m) => m.requirementId === moduleId)) notFound()
    redirect(`/certs/${programId}`)
  }

  const { state, module: mod, index } = gate
  const prev = index > 0 ? state.modules[index - 1] : null
  const next = index < state.modules.length - 1 ? state.modules[index + 1] : null

  return (
    <>
      <CertTopBar
        title={state.program.name}
        subtitle={`Module ${index + 1} of ${state.modules.length} — ${mod.title}`}
        progress={topBarProgress(state, index)}
        backHref={`/certs/${programId}`}
      />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Module {index + 1}
          </p>
          {mod.completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Completed
            </span>
          )}
        </div>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-plum sm:text-3xl">
          {mod.title}
        </h1>

        {mod.kind === 'video' && (
          <>
            <div
              className="relative mt-6 flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-plum-dark bg-cover bg-center shadow-md"
              style={
                mod.videoThumbnailUrl
                  ? { backgroundImage: `url(${mod.videoThumbnailUrl})` }
                  : undefined
              }
            >
              <div className="absolute inset-0 bg-plum-dark/60" />
              <div className="relative flex flex-col items-center gap-3 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm">
                  <svg className="ml-1 h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <p className="text-sm font-medium text-white/70">
                  {mod.minutes ? `${mod.minutes} min video` : 'Video lesson'} — playback wiring
                  lands in Step 4b
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
                How this module completes
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-plum/60">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                  Watch the full lesson — same real-watch-time tracking as everyday HU videos.
                </li>
                {mod.videoHasQuiz && (
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                    Pass this video&apos;s quiz to finish the module.
                  </li>
                )}
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                  The next module unlocks automatically once this one is complete.
                </li>
              </ul>
            </div>
          </>
        )}

        {mod.kind === 'quiz' && (
          <div className="mt-6 rounded-2xl border border-plum/10 bg-white p-8 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <h2 className="mt-4 font-serif text-xl font-semibold text-plum">{mod.title}</h2>
            <p className="mt-2 text-sm text-plum/60">
              {mod.quizQuestionCount
                ? `${mod.quizQuestionCount} questions.`
                : 'Certification quiz.'}{' '}
              Quiz-taking inside the cert area arrives in Step 4b.
            </p>
          </div>
        )}

        {mod.kind === 'path' && (
          <div className="mt-6 rounded-2xl border border-plum/10 bg-white p-8 shadow-sm">
            <h2 className="font-serif text-xl font-semibold text-plum">{mod.title}</h2>
            <p className="mt-2 text-sm text-plum/60">
              This module is completed by finishing the learning path in everyday HU
              {typeof mod.pathVideoCount === 'number' && (
                <>
                  {' '}
                  — {mod.pathCompletedCount} of {mod.pathVideoCount} videos done
                </>
              )}
              .
            </p>
            {mod.pathId && (
              <Link
                href={`/paths/${mod.pathId}`}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Open learning path
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-4">
          {prev ? (
            <Link
              href={`/certs/${programId}/modules/${prev.requirementId}`}
              className="inline-flex items-center gap-2 rounded-full border border-plum/15 px-5 py-2.5 text-sm font-semibold text-plum/70 transition-colors hover:border-plum/30 hover:text-plum"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </Link>
          ) : (
            <span />
          )}

          {next &&
            (next.unlocked ? (
              <Link
                href={`/certs/${programId}/modules/${next.requirementId}`}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Next module
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <span
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-plum/10 px-6 py-2.5 text-sm font-semibold text-plum/40"
                title="Locked until this module is complete"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Next locked
              </span>
            ))}
        </div>

        {next && !next.unlocked && (
          <p className="mt-4 text-right text-xs text-plum/40">
            Next: {next.title} — unlocks when this module is complete.
          </p>
        )}
      </main>
    </>
  )
}
