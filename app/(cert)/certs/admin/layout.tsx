import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CertTopBar from '../../CertTopBar'

// Admin shell for the certification builder (/certs/admin/*). Every page
// below also runs its own admin check (unchanged from when these lived at
// /admin/certs) — this layout re-runs the same gate as defense in depth so
// anything added under /certs/admin is born admin-only. Visually it shares
// the employee cert area's light theme and top-bar treatment so the whole
// cert world reads as one place.
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
    <>
      <CertTopBar
        title="Certification Admin"
        subtitle="Programs, question banks, enrollment & results"
        secondaryAction={{ href: '/certs', label: 'Employee view' }}
      />
      {children}
    </>
  )
}
