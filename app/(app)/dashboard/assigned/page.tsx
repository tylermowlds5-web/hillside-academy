import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video, Progress } from '@/lib/types'
import { getEffectiveProgress } from '@/lib/assignment-progress'
import { fmtDate } from '@/lib/format-date'
import FilteredVideoList, { type FilteredVideoItem } from '../FilteredVideoList'

// Filtered view linked from the dashboard "Assigned" stat card. Shows
// assigned videos the employee hasn't started yet, matching the stat count.

export default async function AssignedVideosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: assignmentRows }, { data: progressRows }] = await Promise.all([
    supabase
      .from('assignments')
      .select('video_id, assigned_at, due_date, videos(*)')
      .eq('user_id', user.id),
    supabase.from('progress').select('*').eq('user_id', user.id),
  ])

  type AssignRow = { video_id: string; assigned_at: string; due_date: string | null; videos: Video | null }
  const assignments = (assignmentRows ?? []) as unknown as AssignRow[]
  const progressByVideo = new Map<string, Progress>()
  for (const p of (progressRows ?? []) as Progress[]) progressByVideo.set(p.video_id, p)

  const items: FilteredVideoItem[] = assignments
    .filter((a): a is AssignRow & { videos: Video } => a.videos !== null)
    .filter((a) => !getEffectiveProgress(progressByVideo.get(a.video_id) ?? null, a.assigned_at).started)
    .map((a) => ({
      video: a.videos,
      meta: a.due_date ? `Due ${fmtDate(a.due_date)}` : null,
    }))

  return (
    <FilteredVideoList
      title="Assigned Videos"
      description="Videos assigned to you that you haven't started yet."
      items={items}
      emptyMessage="No unstarted assignments — you're all caught up."
    />
  )
}
