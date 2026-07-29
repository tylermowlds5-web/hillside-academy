import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

// Certification area shell. Deliberately does NOT share the everyday HU
// chrome: no sidebar, no watermark, light "official course platform" theming
// on the brand tan/plum palette instead of the zinc-950 app shell.
export default async function CertLayout({
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
    .select('is_active')
    .eq('id', user.id)
    .single<Pick<Profile, 'is_active'>>()

  if (profile && profile.is_active === false) {
    redirect('/deactivated')
  }

  return (
    <div className="min-h-screen bg-tan text-plum">
      {children}
    </div>
  )
}
