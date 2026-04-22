import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type {
  LearningPath,
  LearningPathItem,
  Video,
  Progress,
  DocumentRow,
  LearningPathDocument,
  Quiz,
  QuizAttempt,
  LearningPathAssignment,
} from '@/lib/types'
import { fmtDate } from '@/lib/format-date'

function formatDuration(s: number | null) {
  if (!s) return null
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default async function EmployeePathDetailPage(props: {
  params: Promise<{ pathId: string }>
}) {
  const { pathId } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: path } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('id', pathId)
    .single<LearningPath>()

  if (!path) notFound()

  // Access check: employee must be explicitly assigned
  const { data: assignment } = await supabase
    .from('learning_path_assignments')
    .select('*')
    .eq('path_id', pathId)
    .eq('user_id', user.id)
    .maybeSingle<LearningPathAssignment>()

  if (!assignment) redirect('/paths')

  const [
    { data: items },
    { data: allVideos },
    { data: progress },
    { data: pathDocs },
    { data: allDocs },
    { data: videoQuizzes },
    { data: quizAttempts },
  ] = await Promise.all([
    supabase.from('learning_path_items').select('*').eq('path_id', pathId).order('sort_order'),
    supabase.from('videos').select('*'),
    supabase.from('progress').select('*').eq('user_id', user.id),
    supabase.from('learning_path_documents').select('*').eq('path_id', pathId).order('sort_order'),
    supabase.from('documents').select('*'),
    supabase.from('quizzes').select('id, video_id, passing_score'),
    supabase.from('quiz_attempts').select('quiz_id, passed, score').eq('user_id', user.id),
  ])

  const typedItems = (items ?? []) as LearningPathItem[]
  const typedVideos = (allVideos ?? []) as Video[]
  const typedProgress = (progress ?? []) as Progress[]
  const typedPathDocs = (pathDocs ?? []) as LearningPathDocument[]
  const typedAllDocs = (allDocs ?? []) as DocumentRow[]
  const typedQuizzes = (videoQuizzes ?? []) as Pick<Quiz, 'id' | 'video_id' | 'passing_score'>[]
  const typedAttempts = (quizAttempts ?? []) as Pick<QuizAttempt, 'quiz_id' | 'passed' | 'score'>[]

  const videoMap = new Map(typedVideos.map((v) => [v.id, v]))
  const progressByVideo = new Map(typedProgress.map((p) => [p.video_id, p]))
  const docMap = new Map(typedAllDocs.map((d) => [d.id, d]))

  // video_id → quiz row (if quiz exists for that video)
  const quizByVideo = new Map(typedQuizzes.map((q) => [q.video_id, q]))
  // quiz_id → has this user passed it at least once?
  const quizPassedSet = new Set<string>()
  for (const a of typedAttempts) if (a.passed) quizPassedSet.add(a.quiz_id)

  // For path purposes, a video is "completed" only when:
  //   - progress.completed === true (watched to 100%), AND
  //   - if there's a quiz, the user has passed it at least once
  function isVideoComplete(videoId: string): boolean {
    const watched = progressByVideo.get(videoId)?.completed === true
    if (!watched) return false
    const quiz = quizByVideo.get(videoId)
    if (!quiz) return true
    return quizPassedSet.has(quiz.id)
  }

  // Build the display list with lock logic.
  // A video is locked if ANY previous video in the path is not complete.
  const list = typedItems
    .map((item) => {
      const video = videoMap.get(item.video_id)
      if (!video) return null
      const completed = isVideoComplete(item.video_id)
      const prog = progressByVideo.get(item.video_id)
      return {
        item,
        video,
        completed,
        percent: Math.round(prog?.percent_watched ?? 0),
        hasQuiz: !!quizByVideo.get(item.video_id),
      }
    })
    .filter(<T,>(x: T | null): x is T => !!x)

  const displayList = list.map((l, i) => {
    const anyPrevNotCompleted = list.slice(0, i).some((x) => !x.completed)
    const locked = anyPrevNotCompleted && !l.completed
    // The "current" video is the first non-completed, non-locked one
    const prevComplete = !anyPrevNotCompleted
    const current = !l.completed && prevComplete
    return { ...l, locked, current }
  })

  const total = displayList.length
  const completedCount = displayList.filter((l) => l.completed).length
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0
  const allComplete = total > 0 && completedCount === total

  const pathDocuments = typedPathDocs
    .map((pd) => docMap.get(pd.document_id))
    .filter((d): d is DocumentRow => !!d)

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/paths"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Learning Paths
      </Link>

      {/* Completion banner */}
      {assignment?.completed_at && (
        <div className="mb-6 rounded-xl bg-emerald-950/40 border border-emerald-700 px-5 py-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-emerald-300">
              You have completed {path.name}!
            </p>
            <p className="text-xs text-emerald-500/80 mt-0.5">Completed on {fmtDate(assignment.completed_at)}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-50 break-words">{path.name}</h1>
            {path.description && <p className="text-zinc-400 text-sm mt-2">{path.description}</p>}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-zinc-400">{completedCount} of {total} videos completed</span>
            <span className={`font-semibold ${allComplete ? 'text-emerald-400' : 'text-zinc-300'}`}>{pct}%</span>
          </div>
          <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Videos list */}
      <div className="space-y-2 mb-8">
        {displayList.map((entry, i) => {
          const { video, completed, locked, current, percent, hasQuiz } = entry
          const className = `flex items-center gap-3 sm:gap-4 bg-zinc-900 border rounded-xl p-3 sm:p-4 transition-colors ${
            locked
              ? 'border-zinc-800 opacity-50 cursor-not-allowed'
              : current
              ? 'border-emerald-700 bg-emerald-950/20 hover:border-emerald-600 cursor-pointer'
              : 'border-zinc-800 hover:border-zinc-700 cursor-pointer'
          }`

          const content = (
            <>
              {/* Number / status */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold">
                {completed ? (
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                ) : locked ? (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                    <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                ) : (
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${current ? 'border-emerald-400 text-emerald-400' : 'border-zinc-600 text-zinc-400'}`}>
                    {i + 1}
                  </div>
                )}
              </div>

              {/* Thumbnail */}
              <div className="w-20 h-12 sm:w-24 sm:h-14 rounded bg-zinc-800 flex-shrink-0 overflow-hidden">
                {video.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium truncate ${locked ? 'text-zinc-500' : 'text-zinc-100'}`}>
                    {video.title}
                  </p>
                  {current && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded flex-shrink-0">
                      CURRENT
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500 flex-wrap">
                  {video.duration != null && <span>{formatDuration(video.duration)}</span>}
                  {hasQuiz && <span className="text-zinc-500">· Has quiz</span>}
                  {completed ? (
                    <span className="text-emerald-400">· Completed</span>
                  ) : percent > 5 ? (
                    <span className="text-amber-400">· {percent}% watched</span>
                  ) : locked ? (
                    <span>· Locked — complete previous videos first</span>
                  ) : current ? (
                    <span className="text-emerald-400">· Ready to watch</span>
                  ) : (
                    <span>· Not started</span>
                  )}
                </div>
              </div>

              {/* Arrow */}
              {!locked && (
                <svg className="hidden sm:block w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </>
          )

          if (locked) {
            return <div key={entry.item.id} className={className}>{content}</div>
          }
          return (
            <Link key={entry.item.id} href={`/watch/${video.id}?from=path&pathId=${pathId}`} className={className}>
              {content}
            </Link>
          )
        })}

        {displayList.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 text-sm">No videos in this path yet.</p>
          </div>
        )}
      </div>

      {/* Required reading */}
      {pathDocuments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Required Reading</h2>
          <div className="space-y-2">
            {pathDocuments.map((d) => (
              <Link key={d.id} href={`/documents?doc=${d.id}`}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{d.title}</p>
                  {d.description && <p className="text-xs text-zinc-500 truncate">{d.description}</p>}
                </div>
                <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
