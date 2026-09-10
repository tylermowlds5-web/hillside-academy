import Link from 'next/link'

// Slim header for the reference library. Mirrors the certification top bar
// (same palette, same "Exit to HU" pill) minus progress — nothing in the
// library counts toward anything.
export default function LibraryTopBar({
  title,
  subtitle,
  backHref,
}: {
  title: string
  subtitle?: string
  // "Up one level" link shown to the left of the title (detail pages → /library).
  backHref?: string
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-plum/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back to library"
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
            Hillside University · Library
          </p>
          <p className="truncate font-serif text-base font-semibold leading-tight text-plum">
            {title}
          </p>
          {subtitle && <p className="truncate text-xs text-plum/60">{subtitle}</p>}
        </div>

        <Link
          href="/hillside-ai"
          className="hidden shrink-0 rounded-full border border-emerald-600/40 px-4 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600/5 whitespace-nowrap sm:inline-flex"
        >
          Ask Ricky
        </Link>

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
