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
  StandaloneQuiz,
  StandaloneQuizAssignment,
  StandaloneQuizAttempt,
  Category,
} from '@/lib/types'
import { getEffectiveProgress } from '@/lib/assignment-progress'
import CategoryView, { type AssignedPathCard } from './CategoryView'
import QuizzesSection, { type AssignedQuizCard } from './QuizzesSection'

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

  // ── Standalone quiz assignments + best attempts for this user ─────────────
  const [
    { data: standaloneAssignRows },
    { data: standaloneAttemptRows },
    { data: categoryRows },
  ] = await Promise.all([
    supabase
      .from('standalone_quiz_assignments')
      .select('id, quiz_id, due_date, assigned_at, quiz:standalone_quizzes(id, title, description, category_id)')
      .eq('user_id', user.id)
      .order('assigned_at', { ascending: false }),
    supabase
      .from('standalone_quiz_attempts')
      .select('quiz_id, score, passed')
      .eq('user_id', user.id),
    supabase.from('categories').select('id, name'),
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
    // Skip assignments whose video no longer exists (e.g. orphaned rows left by
    // a delete that RLS couldn't fully cascade) so they never render as ghosts.
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

  // ── Build assigned standalone quiz cards (best attempt per quiz) ──────────
  type StandaloneAssignRow = Pick<StandaloneQuizAssignment, 'id' | 'quiz_id' | 'due_date' | 'assigned_at'> & {
    quiz: Pick<StandaloneQuiz, 'id' | 'title' | 'description' | 'category_id'> | null
  }
  const typedStandaloneAssigns = (standaloneAssignRows ?? []) as unknown as StandaloneAssignRow[]
  const typedStandaloneAttempts = (standaloneAttemptRows ?? []) as Pick<StandaloneQuizAttempt, 'quiz_id' | 'score' | 'passed'>[]
  const typedCategoryRows = (categoryRows ?? []) as Pick<Category, 'id' | 'name'>[]
  const categoryNameById = new Map(typedCategoryRows.map((c) => [c.id, c.name]))

  // Best (highest-score) attempt per quiz, plus total attempt count.
  const standaloneBest = new Map<string, { score: number; passed: boolean }>()
  const standaloneAttemptCount = new Map<string, number>()
  for (const a of typedStandaloneAttempts) {
    standaloneAttemptCount.set(a.quiz_id, (standaloneAttemptCount.get(a.quiz_id) ?? 0) + 1)
    const existing = standaloneBest.get(a.quiz_id)
    if (!existing || a.score > existing.score) {
      standaloneBest.set(a.quiz_id, { score: a.score, passed: a.passed })
    }
  }

  const assignedQuizzes: AssignedQuizCard[] = typedStandaloneAssigns
    .filter((a) => a.quiz !== null)
    .map((a) => {
      const best = standaloneBest.get(a.quiz_id)
      return {
        id: a.quiz!.id,
        title: a.quiz!.title,
        description: a.quiz!.description,
        categoryName: a.quiz!.category_id ? categoryNameById.get(a.quiz!.category_id) ?? null : null,
        dueDate: a.due_date,
        bestScore: best?.score ?? null,
        bestPassed: best?.passed ?? false,
        attemptCount: standaloneAttemptCount.get(a.quiz_id) ?? 0,
      }
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

      <QuizzesSection quizzes={assignedQuizzes} />
    </div>
  )
}
