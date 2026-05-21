import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import Sidebar from './Sidebar'

export default async function AppLayout({
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
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  // Block deactivated users from using the app
  if (profile && profile.is_active === false) {
    redirect('/deactivated')
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden w-full">
      <Sidebar profile={profile} />
      {/* Main content. On mobile, pad-top for the fixed mobile header.
          min-w-0 prevents flex children from forcing the parent wider than
          the viewport (which would produce horizontal scroll on phones). */}
      <main className="relative flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
        {/* Faded Hillside brand watermark, centered + rotated behind content */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hillside-icon.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none fixed left-1/2 md:left-[calc(50%+7.5rem)] top-1/2 w-[650px] max-w-[80vw] opacity-[0.10] z-0 -translate-x-1/2 -translate-y-1/2 -rotate-45"
        />
        <div className="relative z-10">
          {children}
        </div>
      </main>
    </div>
  )
}
