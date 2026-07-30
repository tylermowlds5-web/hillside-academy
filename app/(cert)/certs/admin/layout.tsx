import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Admin shell for the certification builder (/certs/admin/*). Every page
// below also runs its own admin check (unchanged from when these lived at
// /admin/certs) — this layout re-runs the same gate as defense in depth so
// anything added under /certs/admin is born admin-only, and wraps the
// subtree in the dark admin theme so the builder components don't sit on
// the tan employee shell.
export default async function CertAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hillside-icon.png" alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Hillside University
            </p>
            <p className="truncate text-sm font-semibold text-zinc-100">Certification Admin</p>
          </div>
          <Link
            href="/certs"
            className="shrink-0 rounded-full border border-zinc-700 px-4 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 whitespace-nowrap"
          >
            Employee view
          </Link>
          <Link
            href="/dashboard"
            className="shrink-0 rounded-full border border-zinc-700 px-4 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 whitespace-nowrap"
          >
            Exit to HU
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}
