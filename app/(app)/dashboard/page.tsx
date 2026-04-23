import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type {
  Video,
  Progress,
  AssignmentWithDetails,
  LearningPath,
  LearningPathItem,
  LearningPathAssignment,
  Quiz,
  QuizAttempt,
} from '@/lib/types'
import { getEffectiveProgress } from '@/lib/assignment-progress'
import CategoryView, { type AssignedPathCard } from './CategoryView'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    { data: assignmentRows, error: assignErr },
    { data: allVideoRows },
    { data: allProgressRows },
    { data: pathAssignments },
    { data: allPaths },
    { data: allPathItems },
    { data: quizzes },
    { data: passedAttempts },
  ] = await Promise.all([
    supabase
      .from('assignments')
      .select('id, video_id, user_id, assigned_by, assigned_at, due_date')
      .eq('user_id', user.id)
      .order('assigned_at', { ascending: false }),
    supabase.from('videos').select('*').order('title'),
    supabase.from('progress').select('*').eq('user_id', user.id),
    supabase.from('learning_path_assignments').select('*').eq('user_id', user.id),
    supabase.from('learning_paths').select('*'),
    supabase.from('learning_path_items').select('*').order('sort_order'),
    supabase.from('quizzes').select('id, video_id'),
    supabase.from('quiz_attempts').select('quiz_id').eq('user_id', user.id).eq('passed', true),
  ])

  if (assignErr) console.error('[dashboard] assignments query error:', assignErr.message)

  const assignments = assignmentRows ?? []
  const allVideos = (allVideoRows ?? []) as Video[]

  const allProgressMap = new Map<string, Progress>()
  for (const p of (allProgressRows ?? []) as Progress[]) {
    allProgressMap.set(p.video_id, p)
  }

  const videoMap = new Map<string, Video>()
  for (const v of allVideos) videoMap.set(v.id, v)

  const assignmentsWithDetails: AssignmentWithDetails[] = []
  for (const a of assignments) {
    const video = videoMap.get(a.video_id as string)
    if (!video) continue
    assignmentsWithDetails.push({
      id: a.id as string,
      video_id: a.video_id as string,
      user_id: a.user_id as string,
      assigned_by: a.assigned_by as string | null,
      assigned_at: a.assigned_at as string,
      due_date: a.due_date as string | null,
      video,
      progress: allProgressMap.get(a.video_id as string) ?? null,
    })
  }

  // ── Build assigned-path cards with per-path progress ────────────────────
  const typedPathAssignments = (pathAssignments ?? []) as LearningPathAssignment[]
  const typedPaths = (allPaths ?? []) as LearningPath[]
  const typedItems = (allPathItems ?? []) as LearningPathItem[]
  const typedQuizzes = (quizzes ?? []) as Pick<Quiz, 'id' | 'video_id'>[]
  const typedPassed = (passedAttempts ?? []) as Pick<QuizAttempt, 'quiz_id'>[]

  const completedVideoIds = new Set(
    [...allProgressMap.values()].filter((p) => p.completed).map((p) => p.video_id)
  )
  const quizByVideo = new Map(typedQuizzes.map((q) => [q.video_id, q.id]))
  const quizPassedSet = new Set(typedPassed.map((a) => a.quiz_id))
  function isVideoComplete(videoId: string): boolean {
    if (!completedVideoIds.has(videoId)) return false
    const quizId = quizByVideo.get(videoId)
    if (!quizId) return true
    return quizPassedSet.has(quizId)
  }

  const pathById = new Map(typedPaths.map((p) => [p.id, p]))
  const assignedPaths: AssignedPathCard[] = typedPathAssignments
    .map((a) => {
      const path = pathById.get(a.path_id)
      if (!path) return null
      const items = typedItems.filter((i) => i.path_id === path.id)
      const completedCount = items.filter((i) => isVideoComplete(i.video_id)).length
      const total = items.length
      return {
        id: path.id,
        name: path.name,
        description: path.description,
        completedCount,
        total,
        complete: (total > 0 && completedCount === total) || !!a.completed_at,
      }
    })
    .filter((x): x is AssignedPathCard => !!x)

  // Stats — focused on assignments, using assignment-relative effective progress.
  // Pre-assignment watches don't count; re-assigned videos start fresh.
  const totalVideos = allVideos.length
  const assignmentEffs = assignmentsWithDetails.map((a) =>
    getEffectiveProgress(a.progress, a.assigned_at)
  )
  const videosWatched = assignmentEffs.filter((e) => e.completed).length
  const inProgressCount = assignmentEffs.filter((e) => e.started && !e.completed).length
  const assignedIds = new Set(assignmentsWithDetails.map((a) => a.video_id))
  const assignedNotStarted = assignmentEffs.filter((e) => !e.started).length

  const unwatchedVideos = allVideos.filter((v) => {
    if (assignedIds.has(v.id)) return false
    const p = allProgressMap.get(v.id)
    return !p || (p.percent_watched ?? 0) === 0
  })

  return (
    <div className="p-4 sm:p-6 w-full max-w-6xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-50">My Training</h1>
        <p className="text-zinc-400 text-sm mt-1">Your assigned paths, videos, and progress</p>
      </div>

      <CategoryView
        assignments={assignmentsWithDetails}
        totalVideos={totalVideos}
        videosWatched={videosWatched}
        inProgressCount={inProgressCount}
        assignedNotStarted={assignedNotStarted}
        unwatchedVideos={unwatchedVideos}
        assignedPaths={assignedPaths}
      />
    </div>
  )
}
