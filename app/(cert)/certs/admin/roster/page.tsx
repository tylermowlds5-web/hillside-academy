import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CertAward, CertProgram, Profile } from '@/lib/types'
import RosterClient, {
  type RosterEmployee,
  type RosterCert,
  type RosterStatus,
  type RosterProgram,
} from './RosterClient'

// Certification roster: EVERY active employee with all the certs they hold
// (including nobody-certified-yet rows), inline expiry override, manual
// grant, revoke, and delete. This is the record used for raise/renewal
// decisions.

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

  const [{ data: awards }, { data: programs }, { data: people }] = await Promise.all([
    supabase.from('cert_awards').select('*').returns<CertAward[]>(),
    supabase.from('cert_programs').select('*').returns<CertProgram[]>(),
    supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
      .returns<Profile[]>(),
  ])

  const programById = new Map((programs ?? []).map((p) => [p.id, p]))

  const certsByUser = new Map<string, RosterCert[]>()
  for (const a of awards ?? []) {
    const program = programById.get(a.program_id)
    const list = certsByUser.get(a.user_id) ?? []
    list.push({
      awardId: a.id,
      programId: a.program_id,
      programName: program?.name ?? 'Removed program',
      earnedAt: a.earned_at,
      expiresAt: a.expires_at,
      status: statusOf(a),
      adminGranted: a.awarded_by !== null,
      renewalOpen: Boolean(
        a.renewal_started_at && Date.parse(a.renewal_started_at) > Date.parse(a.earned_at)
      ),
    })
    certsByUser.set(a.user_id, list)
  }

  const employees: RosterEmployee[] = (people ?? []).map((p) => ({
    userId: p.id,
    name: p.full_name ?? p.email,
    email: p.email,
    isAdmin: p.role === 'admin',
    certs: (certsByUser.get(p.id) ?? []).sort((a, b) =>
      a.programName.localeCompare(b.programName)
    ),
  }))

  const programOptions: RosterProgram[] = (programs ?? [])
    .map((p) => ({ id: p.id, name: p.name, validityMonths: p.validity_months }))
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
        Every active employee and the credentials they hold — the record for raise and
        renewal decisions. &ldquo;Expiring soon&rdquo; = within {EXPIRING_SOON_DAYS} days.
        Grant, revoke, or delete certs, and edit expirations inline (blank = never
        expires). Manual grants are marked so they stay distinguishable from
        earned-by-passing.
      </p>

      <RosterClient employees={employees} programs={programOptions} />
    </main>
  )
}
