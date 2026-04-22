import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Video, Progress, Quiz, QuizAttempt, LearningPath, LearningPathItem } from '@/lib/types'
import { fmtDate, fmtTime } from '@/lib/format-date'
import WatchContent, { type PathContext } from './WatchContent'

export default async function WatchPage(props: {
  params: Promise<{ videoId: string }>
  searchParams: Promise<{ from?: string; pathId?: string; path?: string }>
}) {
  const [{ videoId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])
  const { from } = searchParams
  // Accept either ?path= or ?pathId= for the learning-path ID
  const pathId = searchParams.path ?? searchParams.pathId
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: video } = await supabase
    .from('videos')
    .select('*')
    .eq('id', videoId)
    .single<Video>()

  if (!video) notFound()

  // ── Figure out back link ─────────────────────────────────────────────
  // If pathId is in the URL, we're in a learning path context regardless of
  // the `from` param. This makes deep links into a path work.
  let backHref = '/dashboard'
  let backLabel = 'My Training'
  if (pathId) { backHref = `/paths/${pathId}`; backLabel = 'Learning Path' }
  else if (from === 'library') { backHref = '/videos'; backLabel = 'Video Library' }

  // ── Core data ─────────────────────────────────────────────────────────
  const [{ data: progressData }, { data: quizData }, { data: attemptsData }] =
    await Promise.all([
      supabase
        .from('progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('video_id', videoId)
        .single<Progress>(),
      supabase
        .from('quizzes')
        .select('*')
        .eq('video_id', videoId)
        .single<Quiz>(),
      supabase
        .from('quiz_attempts')
        .select('*')
        .eq('user_id', user.id)
        .order('taken_at', { ascending: false }),
    ])

  const progress = progressData ?? null
  const quiz = quizData ?? null
  const allAttempts = (attemptsData ?? []) as QuizAttempt[]
  const attempts = quiz ? allAttempts.filter((a) => a.quiz_id === quiz.id) : []
  const bestAttempt = attempts.length > 0
    ? attempts.reduce((best, a) => (a.score > best.score ? a : best), attempts[0])
    : null

  // ── Path context (whenever pathId is in the URL) ─────────────────────
  let pathContext: PathContext | null = null
  if (pathId) {
    const [{ data: path }, { data: items }, { data: allProgress }, { data: allQuizzes }, { data: passedAttempts }] = await Promise.all([
      supabase.from('learning_paths').select('*').eq('id', pathId).single<LearningPath>(),
      supabase.from('learning_path_items').select('*').eq('path_id', pathId).order('sort_order'),
      supabase.from('progress').select('video_id, completed').eq('user_id', user.id),
      supabase.from('quizzes').select('id, video_id'),
      supabase.from('quiz_attempts').select('quiz_id').eq('user_id', user.id).eq('passed', true),
    ])

    const typedItems = (items ?? []) as LearningPathItem[]
    const currentIndex = typedItems.findIndex((i) => i.video_id === videoId)

    if (path && currentIndex !== -1) {
      // Count completed videos in the path (watched 100% AND passed quiz if one exists)
      const completedVideoIds = new Set(
        (allProgress ?? []).filter((p: { completed: boolean }) => p.completed).map((p: { video_id: string }) => p.video_id)
      )
      const quizByVideo = new Map<string, string>()
      for (const q of (allQuizzes ?? []) as { id: string; video_id: string }[]) quizByVideo.set(q.video_id, q.id)
      const passedQuizIds = new Set(
        (passedAttempts ?? []).map((a: { quiz_id: string }) => a.quiz_id)
      )

      const completedCount = typedItems.filter((item) => {
        if (!completedVideoIds.has(item.video_id)) return false
        const quizId = quizByVideo.get(item.video_id)
        if (!quizId) return true
        return passedQuizIds.has(quizId)
      }).length

      const next = typedItems[currentIndex + 1] ?? null
      pathContext = {
        pathId: path.id,
        pathName: path.name,
        currentIndex,
        totalItems: typedItems.length,
        completedCount,
        isLastVideo: currentIndex === typedItems.length - 1,
        nextVideoId: next?.video_id ?? null,
      }
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 sm:mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to {backLabel}
      </Link>

      {/* Interactive player + quiz prompt (client component).
          key on video.id forces a full remount when navigating between videos
          (e.g. Next Video in a path) so completion/quiz state doesn't bleed. */}
      <WatchContent
        key={video.id}
        video={video}
        initialProgress={progress}
        quiz={quiz}
        bestAttempt={bestAttempt}
        pathContext={pathContext}
      />

      {/* Attempt history — static, server-rendered */}
      {attempts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-zinc-200 mb-3">
            Quiz Attempts
            <span className="ml-2 text-xs font-normal text-zinc-500">{attempts.length} total</span>
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Date &amp; Time</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Score</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {attempts.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-800/40">
                      <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">
                        {fmtDate(a.taken_at)}{' '}
                        <span className="text-zinc-600 text-xs">{fmtTime(a.taken_at)}</span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold">
                        <span className={a.passed ? 'text-emerald-400' : 'text-red-400'}>{a.score}%</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {a.passed ? 'Passed' : 'Failed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
