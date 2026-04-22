import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile, JobRole, UserJobRole } from '@/lib/types'
import UsersClient from './UsersClient'

export default async function AdminUsersPage() {
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

  const [
    { data: users },
    { data: sessions },
    { data: roles },
    { data: userRoles },
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase
      .from('sessions')
      .select('user_id, logged_in_at')
      .order('logged_in_at', { ascending: false }),
    supabase.from('roles').select('*').order('name'),
    supabase.from('user_roles').select('*'),
  ])

  const typedUsers = (users ?? []) as Profile[]
  const typedSessions = (sessions ?? []) as { user_id: string; logged_in_at: string }[]
  const typedRoles = (roles ?? []) as JobRole[]
  const typedUserRoles = (userRoles ?? []) as UserJobRole[]

  const lastLoginByUser: Record<string, string> = {}
  for (const s of typedSessions) {
    if (!lastLoginByUser[s.user_id]) lastLoginByUser[s.user_id] = s.logged_in_at
  }

  return (
    <UsersClient
      users={typedUsers}
      lastLoginByUser={lastLoginByUser}
      currentUserId={user.id}
      roles={typedRoles}
      userRoles={typedUserRoles}
    />
  )
}
