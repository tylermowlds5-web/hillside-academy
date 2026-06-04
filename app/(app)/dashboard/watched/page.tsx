import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video, Progress } from '@/lib/types'
import { getEffectiveProgress } from '@/lib/assignment-progress'
import { fmtDate } from '@/lib/format-date'
import FilteredVideoList, { type FilteredVideoItem } from '../FilteredVideoList'

// Filtered view linked from the dashboard "Watched" stat card. Shows every
// assigned video the employee has completed, matching the stat's count.

export default async function WatchedVideosPage() {
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
    .filter((a) => getEffectiveProgress(progressByVideo.get(a.video_id) ?? null, a.assigned_at).completed)
    .map((a) => {
      const prog = progressByVideo.get(a.video_id) ?? null
      return {
        video: a.videos,
        meta: prog?.last_watched_at ? `Watched on ${fmtDate(prog.last_watched_at)}` : null,
      }
    })

  return (
    <FilteredVideoList
      title="Watched Videos"
      description="Assigned videos you've completed."
      items={items}
      emptyMessage="You haven't completed any assigned videos yet."
    />
  )
}
