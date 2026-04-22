import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Video, Quiz } from '@/lib/types'
import { deleteQuiz } from '@/app/actions'
import QuizBuilder from './QuizBuilder'

export default async function QuizManagePage(props: {
  params: Promise<{ videoId: string }>
}) {
  const { videoId } = await props.params
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

  const { data: video } = await supabase
    .from('videos')
    .select('*')
    .eq('id', videoId)
    .single<Video>()
  if (!video) notFound()

  const { data: quizData } = await supabase
    .from('quizzes')
    .select('*')
    .eq('video_id', videoId)
    .single<Quiz>()

  const quiz = quizData ?? null

  let attemptCount = 0
  if (quiz) {
    const { count } = await supabase
      .from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('quiz_id', quiz.id)
    attemptCount = count ?? 0
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link
        href="/admin/videos"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Videos
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-50">
          {quiz ? 'Edit Quiz' : 'Create Quiz'}
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {video.title}
        </p>
        {quiz && (
          <div className="flex items-center gap-4 mt-3">
            <span className="text-xs text-zinc-500">
              {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-zinc-500">Passing: {quiz.passing_score}%</span>
            <span className="text-xs text-zinc-500">{attemptCount} attempt{attemptCount !== 1 ? 's' : ''}</span>
            <form
              action={async () => {
                'use server'
                await deleteQuiz(quiz.id, videoId)
              }}
            >
              <button
                type="submit"
                className="text-xs text-red-500 hover:text-red-400 transition-colors"
              >
                Delete quiz
              </button>
            </form>
          </div>
        )}
      </div>

      <QuizBuilder videoId={videoId} existing={quiz} />
    </div>
  )
}
