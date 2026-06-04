import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video, Progress } from '@/lib/types'
import { getEffectiveProgress } from '@/lib/assignment-progress'
import FilteredVideoList, { type FilteredVideoItem } from '../FilteredVideoList'

// Filtered view linked from the dashboard "In Progress" stat card. Shows
// assigned videos the employee has started but not completed.

export default async function InProgressVideosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: assignmentRows }, { data: progressRows }] = await Promise.all([
    supabase
      .from('assignments')
      .select('video_id, assigned_at, videos(*)')
      .eq('user_id', user.id),
    supabase.from('progress').select('*').eq('user_id', user.id),
  ])

  type AssignRow = { video_id: string; assigned_at: string; videos: Video | null }
  const assignments = (assignmentRows ?? []) as unknown as AssignRow[]
  const progressByVideo = new Map<string, Progress>()
  for (const p of (progressRows ?? []) as Progress[]) progressByVideo.set(p.video_id, p)

  const items: FilteredVideoItem[] = assignments
    .filter((a): a is AssignRow & { videos: Video } => a.videos !== null)
    .map((a) => ({ a, eff: getEffectiveProgress(progressByVideo.get(a.video_id) ?? null, a.assigned_at) }))
    .filter(({ eff }) => eff.started && !eff.completed)
    .map(({ a, eff }) => ({
      video: a.videos,
      meta: `${Math.round(eff.percent)}% watched`,
    }))

  return (
    <FilteredVideoList
      title="In Progress"
      description="Assigned videos you've started but haven't finished yet."
      items={items}
      emptyMessage="No videos in progress."
    />
  )
}
