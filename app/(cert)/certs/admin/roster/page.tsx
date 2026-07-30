import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CertAward, CertProgram, Profile } from '@/lib/types'
import RosterClient, { type RosterRow, type RosterStatus } from './RosterClient'

// Certification roster: every award across all programs — who holds what,
// its status, and its expiration — with inline expiry override. This is the
// record used for raise/renewal decisions.

const EXPIRING_SOON_DAYS = 30

function statusOf(award: CertAward): RosterStatus {
  if (award.revoked_at) return 'revoked'
  if (award.expires_at) {
    const ms = new Date(award.expires_at).getTime() - Date.now()
    if (ms < 0) return 'expired'
    if (ms < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return 'expiring'
  }
  return 'active'
}

export default async function CertRosterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: awards }, { data: programs }] = await Promise.all([
    supabase.from('cert_awards').select('*').returns<CertAward[]>(),
    supabase.from('cert_programs').select('*').returns<CertProgram[]>(),
  ])

  const userIds = [...new Set((awards ?? []).map((a) => a.user_id))]
  const { data: people } = userIds.length
    ? await supabase.from('profiles').select('*').in('id', userIds).returns<Profile[]>()
    : { data: [] as Profile[] }

  const programById = new Map((programs ?? []).map((p) => [p.id, p]))
  const personById = new Map((people ?? []).map((p) => [p.id, p]))

  const rows: RosterRow[] = (awards ?? [])
    .map((a) => {
      const person = personById.get(a.user_id)
      const program = programById.get(a.program_id)
      return {
        awardId: a.id,
        employeeName: person?.full_name ?? person?.email ?? 'Unknown employee',
        employeeEmail: person?.email ?? '',
        programId: a.program_id,
        programName: program?.name ?? 'Removed program',
        earnedAt: a.earned_at,
        expiresAt: a.expires_at,
        status: statusOf(a),
        renewalOpen: Boolean(
          a.renewal_started_at && Date.parse(a.renewal_started_at) > Date.parse(a.earned_at)
        ),
      }
    })
    .sort((x, y) => x.employeeName.localeCompare(y.employeeName))

  const programOptions = (programs ?? [])
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/certs/admin"
        className="inline-flex items-center gap-1.5 text-sm text-plum/60 hover:text-plum mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Certifications
      </Link>

      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-plum mb-1">
        Certification Roster
      </h1>
      <p className="text-sm text-plum/50 mb-6">
        Every credential held, with status and expiration — the record for raise and renewal
        decisions. &ldquo;Expiring soon&rdquo; = within {EXPIRING_SOON_DAYS} days. Edit an
        expiration date inline to extend, shorten, or grandfather (blank = never expires).
      </p>

      <RosterClient rows={rows} programs={programOptions} />
    </main>
  )
}
