import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LearningPath, LearningPathItem, LearningPathAssignment } from '@/lib/types'
import PathsClient from './PathsClient'

export default async function AdminPathsPage() {
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

  const [{ data: paths }, { data: items }, { data: assignments }] = await Promise.all([
    supabase.from('learning_paths').select('*').order('created_at', { ascending: false }),
    supabase.from('learning_path_items').select('*'),
    supabase.from('learning_path_assignments').select('*'),
  ])

  const typedPaths = (paths ?? []) as LearningPath[]
  const typedItems = (items ?? []) as LearningPathItem[]
  const typedAssignments = (assignments ?? []) as LearningPathAssignment[]

  // Counts per path
  const itemCountByPath = new Map<string, number>()
  for (const i of typedItems) itemCountByPath.set(i.path_id, (itemCountByPath.get(i.path_id) ?? 0) + 1)
  const assigneeCountByPath = new Map<string, number>()
  for (const a of typedAssignments) assigneeCountByPath.set(a.path_id, (assigneeCountByPath.get(a.path_id) ?? 0) + 1)

  const pathsWithCounts = typedPaths.map((p) => ({
    ...p,
    videoCount: itemCountByPath.get(p.id) ?? 0,
    assigneeCount: assigneeCountByPath.get(p.id) ?? 0,
  }))

  return <PathsClient paths={pathsWithCounts} />
}
