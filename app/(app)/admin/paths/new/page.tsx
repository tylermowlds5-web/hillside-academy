import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video, Profile, JobRole, UserJobRole } from '@/lib/types'
import PathFormClient from '../PathFormClient'

export default async function NewPathPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: allVideos }, { data: employees }, { data: roles }, { data: userRoles }] = await Promise.all([
    supabase.from('videos').select('*').order('title'),
    supabase.from('profiles').select('*').eq('role', 'employee').eq('is_active', true).order('full_name'),
    supabase.from('roles').select('*').order('name'),
    supabase.from('user_roles').select('*'),
  ])

  return (
    <PathFormClient
      mode="create"
      allVideos={(allVideos ?? []) as Video[]}
      employees={(employees ?? []) as Profile[]}
      roles={(roles ?? []) as JobRole[]}
      userRoles={(userRoles ?? []) as UserJobRole[]}
    />
  )
}
