import { createClient } from '@/lib/supabase/server'
import type { Profile, Video, Progress, QuizAttempt, Quiz } from '@/lib/types'
import { fmtDateTime } from '@/lib/format-date'

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCSV).join(',')
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 })

  const [
    { data: employees },
    { data: videos },
    { data: assignments },
    { data: allProgress },
    { data: quizzes },
    { data: quizAttempts },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'),
    supabase.from('videos').select('*').order('title'),
    supabase.from('assignments').select('user_id, video_id'),
    supabase.from('progress').select('*'),
    supabase.from('quizzes').select('id, video_id, passing_score'),
    supabase
      .from('quiz_attempts')
      .select('user_id, quiz_id, score, passed, taken_at')
      .order('taken_at', { ascending: false }),
  ])

  const typedEmployees = (employees ?? []) as Profile[]
  const typedVideos = (videos ?? []) as Video[]
  const typedAssignments = (assignments ?? []) as { user_id: string; video_id: string }[]
  const typedProgress = (allProgress ?? []) as Progress[]
  const typedQuizzes = (quizzes ?? []) as Quiz[]
  const typedAttempts = (quizAttempts ?? []) as (QuizAttempt & { quiz_id: string })[]

  // Build lookup maps
  const assignedSet = new Set(typedAssignments.map((a) => `${a.user_id}:${a.video_id}`))
  const progressMap = new Map<string, Progress>()
  for (const p of typedProgress) progressMap.set(`${p.user_id}:${p.video_id}`, p)

  const quizByVideo = new Map<string, Quiz>()
  for (const q of typedQuizzes) quizByVideo.set(q.video_id, q)

  // Best attempt per user per quiz
  const bestAttemptMap = new Map<string, QuizAttempt>()
  for (const a of typedAttempts) {
    const key = `${a.user_id}:${a.quiz_id}`
    const existing = bestAttemptMap.get(key)
    if (!existing || a.score > existing.score) bestAttemptMap.set(key, a)
  }

  const lines: string[] = [
    row(
      'Employee Name',
      'Email',
      'Video Title',
      '% Watched',
      'Completed',
      'Last Watched',
      'Has Quiz',
      'Best Quiz Score',
      'Quiz Passed',
      'Quiz Date'
    ),
  ]

  for (const emp of typedEmployees) {
    for (const vid of typedVideos) {
      if (!assignedSet.has(`${emp.id}:${vid.id}`)) continue

      const prog = progressMap.get(`${emp.id}:${vid.id}`)
      const quiz = quizByVideo.get(vid.id) ?? null
      const bestAttempt = quiz ? bestAttemptMap.get(`${emp.id}:${quiz.id}`) ?? null : null

      lines.push(
        row(
          emp.full_name ?? '',
          emp.email,
          vid.title,
          prog ? Math.round(prog.percent_watched) : 0,
          prog?.completed ? 'Yes' : 'No',
          prog ? fmtDateTime(prog.last_watched_at) : '',
          quiz ? 'Yes' : 'No',
          bestAttempt ? bestAttempt.score : '',
          bestAttempt ? (bestAttempt.passed ? 'Yes' : 'No') : '',
          bestAttempt ? fmtDateTime(bestAttempt.taken_at) : ''
        )
      )
    }
  }

  const csv = lines.join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="hillside-academy-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
