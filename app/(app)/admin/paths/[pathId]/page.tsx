import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type {
  LearningPath,
  LearningPathItem,
  LearningPathAssignment,
  Video,
  Profile,
  JobRole,
  UserJobRole,
} from '@/lib/types'
import PathFormClient from '../PathFormClient'

export default async function PathDetailPage(props: {
  params: Promise<{ pathId: string }>
}) {
  const { pathId } = await props.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: path } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('id', pathId)
    .single<LearningPath>()
  if (!path) notFound()

  const [
    { data: items },
    { data: allVideos },
    { data: assignments },
    { data: employees },
    { data: roles },
    { data: userRoles },
  ] = await Promise.all([
    supabase.from('learning_path_items').select('*').eq('path_id', pathId).order('sort_order'),
    supabase.from('videos').select('*').order('title'),
    supabase.from('learning_path_assignments').select('*').eq('path_id', pathId),
    supabase.from('profiles').select('*').eq('role', 'employee').eq('is_active', true).order('full_name'),
    supabase.from('roles').select('*').order('name'),
    supabase.from('user_roles').select('*'),
  ])

  const typedItems = (items ?? []) as LearningPathItem[]
  const typedAssignments = (assignments ?? []) as LearningPathAssignment[]

  return (
    <PathFormClient
      mode="edit"
      pathId={path.id}
      initialName={path.name}
      initialDescription={path.description ?? ''}
      initialVideoIds={typedItems.sort((a, b) => a.sort_order - b.sort_order).map((i) => i.video_id)}
      initialEmployeeIds={typedAssignments.map((a) => a.user_id)}
      allVideos={(allVideos ?? []) as Video[]}
      employees={(employees ?? []) as Profile[]}
      roles={(roles ?? []) as JobRole[]}
      userRoles={(userRoles ?? []) as UserJobRole[]}
    />
  )
}
