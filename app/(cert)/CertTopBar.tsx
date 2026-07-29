import Link from 'next/link'

// Minimal top bar for the certification area. Rendered by each page (not the
// layout) so the program title and module progress can come straight from the
// page's own data — no client-side context plumbing needed.
export type CertModuleProgress = {
  total: number
  completed: number
  // 1-based index of the module currently open/being worked; drawn as a ring.
  current?: number
}

function ProgressDots({ progress }: { progress: CertModuleProgress }) {
  return (
    <div className="hidden sm:flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: progress.total }, (_, i) => {
          const n = i + 1
          const done = n <= progress.completed
          const current = n === progress.current
          return (
            <span
              key={n}
              aria-hidden="true"
              className={
                done
                  ? 'h-2.5 w-2.5 rounded-full bg-emerald-600'
                  : current
                    ? 'h-2.5 w-2.5 rounded-full bg-white ring-2 ring-emerald-600'
                    : 'h-2.5 w-2.5 rounded-full bg-plum/15'
              }
            />
          )
        })}
      </div>
      <span className="text-xs font-medium text-plum/60 whitespace-nowrap">
        {progress.completed} of {progress.total} modules
      </span>
    </div>
  )
}

export default function CertTopBar({
  title,
  subtitle,
  progress,
  backHref,
}: {
  title: string
  // Small line under the title (e.g. "Module 3 of 6") on module pages.
  subtitle?: string
  progress?: CertModuleProgress
  // Optional "up one level" link shown to the left of the title.
  backHref?: string
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-plum/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-plum/15 text-plum/60 transition-colors hover:border-plum/30 hover:text-plum"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hillside-icon.png" alt="" aria-hidden="true" className="h-8 w-8 shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-plum/50">
            Hillside University · Certification
          </p>
          <p className="truncate font-serif text-base font-semibold leading-tight text-plum">
            {title}
          </p>
          {subtitle && (
            <p className="truncate text-xs text-plum/60">{subtitle}</p>
          )}
        </div>

        {progress && <ProgressDots progress={progress} />}

        <Link
          href="/dashboard"
          className="shrink-0 rounded-full border border-plum/15 px-4 py-1.5 text-xs font-semibold text-plum/70 transition-colors hover:border-plum/30 hover:text-plum whitespace-nowrap"
        >
          Exit to HU
        </Link>
      </div>
    </header>
  )
}
