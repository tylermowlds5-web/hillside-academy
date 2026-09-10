import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

// Reference library shell (/library). Same light tan/plum theme as the
// certification area — plant pages and lesson pages are designed for it —
// and no everyday-HU sidebar. Any signed-in, active employee can read
// everything here; nothing in the library is gated or tracked.
export default async function LibraryLayout({
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
