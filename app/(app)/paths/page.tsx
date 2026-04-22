import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type {
  LearningPath,
  LearningPathItem,
  LearningPathAssignment,
  Progress,
  Quiz,
  QuizAttempt,
} from '@/lib/types'

export default async function EmployeePathsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: assignments },
    { data: allPaths },
    { data: items },
    { data: progress },
    { data: quizzes },
    { data: attempts },
  ] = await Promise.all([
    supabase.from('learning_path_assignments').select('*').eq('user_id', user.id),
    supabase.from('learning_paths').select('*').order('created_at'),
    supabase.from('learning_path_items').select('*').order('sort_order'),
    supabase.from('progress').select('video_id, completed').eq('user_id', user.id),
    supabase.from('quizzes').select('id, video_id'),
    supabase.from('quiz_attempts').select('quiz_id, passed').eq('user_id', user.id),
  ])

  const typedAssignments = (assignments ?? []) as LearningPathAssignment[]
  const typedPaths = (allPaths ?? []) as LearningPath[]
  const typedItems = (items ?? []) as LearningPathItem[]
  const typedProgress = (progress ?? []) as Pick<Progress, 'video_id' | 'completed'>[]
  const typedQuizzes = (quizzes ?? []) as Pick<Quiz, 'id' | 'video_id'>[]
  const typedAttempts = (attempts ?? []) as Pick<QuizAttempt, 'quiz_id' | 'passed'>[]

  const assignmentByPath = new Map(typedAssignments.map((a) => [a.path_id, a]))
  // Employees only see paths they've been explicitly assigned
  const visiblePaths = typedPaths.filter((p) => assignmentByPath.has(p.id))

  const completedVideoIds = new Set(
    typedProgress.filter((p) => p.completed).map((p) => p.video_id)
  )
  const quizByVideo = new Map(typedQuizzes.map((q) => [q.video_id, q]))
  const quizPassedSet = new Set<string>()
  for (const a of typedAttempts) if (a.passed) quizPassedSet.add(a.quiz_id)

  function isVideoComplete(videoId: string): boolean {
    if (!completedVideoIds.has(videoId)) return false
    const q = quizByVideo.get(videoId)
    if (!q) return true
    return quizPassedSet.has(q.id)
  }

  const pathsWithProgress = visiblePaths.map((p) => {
    const pathItems = typedItems.filter((i) => i.path_id === p.id)
    const completedCount = pathItems.filter((i) => isVideoComplete(i.video_id)).length
    const assignment = assignmentByPath.get(p.id)
    const allDone = pathItems.length > 0 && completedCount === pathItems.length
    return {
      ...p,
      totalVideos: pathItems.length,
      completedVideos: completedCount,
      complete: allDone || !!assignment?.completed_at,
      completedAt: assignment?.completed_at ?? null,
    }
  })

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-50">Learning Paths</h1>
        <p className="text-zinc-400 text-sm mt-1">Structured training sequences assigned to you</p>
      </div>

      {pathsWithProgress.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No learning paths assigned yet.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {pathsWithProgress.map((p) => {
            const pct = p.totalVideos > 0 ? Math.round((p.completedVideos / p.totalVideos) * 100) : 0
            return (
              <Link key={p.id} href={`/paths/${p.id}`}
                className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 sm:p-5 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-base font-semibold text-zinc-100 group-hover:text-white break-words">{p.name}</h2>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {p.complete && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        COMPLETE
                      </span>
                    )}
                  </div>
                </div>
                {p.description && (
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{p.description}</p>
                )}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-zinc-400">{p.completedVideos} of {p.totalVideos} videos</span>
                    <span className={`font-semibold ${p.complete ? 'text-emerald-400' : 'text-zinc-300'}`}>{pct}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${p.complete ? 'bg-emerald-500' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
