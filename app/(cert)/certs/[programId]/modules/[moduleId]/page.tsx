import Link from 'next/link'
import { notFound } from 'next/navigation'
import CertTopBar from '../../../../CertTopBar'
import { placeholderProgram, programProgress } from '../../../placeholder-data'

// ── PLACEHOLDER PAGE — Step 3 look review. Dummy data, no DB reads. ──────
// Shell for a single module: video area, module notes, and prev/next
// navigation. Real playback, completion, and gating logic come later.

export default async function ModulePage(props: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await props.params
  const program = placeholderProgram(programId)
  if (!program) notFound()

  const idx = program.modules.findIndex((m) => m.id === moduleId)
  if (idx === -1) notFound()

  const module = program.modules[idx]
  const prev = idx > 0 ? program.modules[idx - 1] : null
  const next = idx < program.modules.length - 1 ? program.modules[idx + 1] : null
  const progress = { ...programProgress(program), current: idx + 1 }

  return (
    <>
      <CertTopBar
        title={program.name}
        subtitle={`Module ${idx + 1} of ${program.modules.length} — ${module.title}`}
        progress={progress}
        backHref={`/certs/${program.id}`}
      />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
          Module {idx + 1}
        </p>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-plum sm:text-3xl">
          {module.title}
        </h1>

        {/* Video placeholder */}
        <div className="mt-6 flex aspect-video w-full items-center justify-center rounded-2xl bg-plum-dark shadow-md">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white">
              <svg className="ml-1 h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <p className="text-sm font-medium text-white/60">
              Video lesson placeholder · {module.minutes} min
            </p>
          </div>
        </div>

        {/* Module notes */}
        <div className="mt-8 rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
            About this module
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-plum/70 sm:text-base">
            {module.blurb ||
              'Module summary goes here — what this lesson covers, why it matters in the field, and what you should be able to do once you finish it.'}
          </p>
          <ul className="mt-5 space-y-2 text-sm text-plum/60">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
              Watch the full lesson — progress is tracked like everyday HU videos.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
              Pass the knowledge check at the end to unlock the next module.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
              Your credential is awarded after the final certification exam.
            </li>
          </ul>
        </div>

        {/* Prev / next navigation */}
        <div className="mt-8 flex items-center justify-between gap-4">
          {prev ? (
            <Link
              href={`/certs/${program.id}/modules/${prev.id}`}
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

          <button
            type="button"
            disabled
            title="Placeholder — completion logic arrives in a later step"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white opacity-60"
          >
            Mark complete{next ? ' & continue' : ' & finish'}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {next && (
          <p className="mt-4 text-right text-xs text-plum/40">
            Next: {next.title}
            {next.state === 'locked' && ' (locked until this module is complete)'}
          </p>
        )}
      </main>
    </>
  )
}
