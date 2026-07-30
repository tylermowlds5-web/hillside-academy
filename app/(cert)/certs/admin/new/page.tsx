import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProgramDetailsForm from '../ProgramDetailsForm'

export default async function NewCertProgramPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <Link
        href="/certs/admin"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Certifications
      </Link>

      <h1 className="text-xl sm:text-2xl font-bold text-zinc-50 mb-6">New Certification Program</h1>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
        <ProgramDetailsForm />
      </section>
    </div>
  )
}
