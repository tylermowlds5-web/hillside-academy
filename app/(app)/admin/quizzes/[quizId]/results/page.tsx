import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type {
  Profile,
  StandaloneQuiz,
  StandaloneQuizAssignment,
  StandaloneQuizAttempt,
} from '@/lib/types'
import ResultsClient, { type ResultRow } from './ResultsClient'

// Admin results page for one standalone quiz. Lists every employee touched by
// the quiz — anyone who's been assigned OR has attempted — and surfaces their
// best attempt + a button to drill into the per-question breakdown.

export default async function StandaloneQuizResultsPage(props: {
  params: Promise<{ quizId: string }>
}) {
  const { quizId } = await props.params
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

  const { data: quizData } = await supabase
    .from('standalone_quizzes')
    .select('*')
    .eq('id', quizId)
    .single<StandaloneQuiz>()
  if (!quizData) notFound()

  const [{ data: assignmentRows }, { data: attemptRows }] = await Promise.all([
    supabase
      .from('standalone_quiz_assignments')
      .select('user_id, due_date, assigned_at')
      .eq('quiz_id', quizId),
    supabase
      .from('standalone_quiz_attempts')
      .select('*')
      .eq('quiz_id', quizId)
      .order('taken_at', { ascending: false }),
  ])

  const assignments = (assignmentRows ?? []) as Pick<StandaloneQuizAssignment, 'user_id' | 'due_date' | 'assigned_at'>[]
  const attempts = (attemptRows ?? []) as StandaloneQuizAttempt[]

  // All user_ids that need a profile lookup — anyone assigned OR who attempted.
  const userIdSet = new Set<string>([
    ...assignments.map((a) => a.user_id),
    ...attempts.map((a) => a.user_id),
  ])
  const userIds = [...userIdSet]

  const { data: profileRows } = userIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] as Pick<Profile, 'id' | 'full_name' | 'email'>[] }

  const profilesById = new Map<string, Pick<Profile, 'id' | 'full_name' | 'email'>>()
  for (const p of (profileRows ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[]) {
    profilesById.set(p.id, p)
  }

  // Per-user aggregates: best attempt (highest score) + total count.
  const bestAttemptByUser = new Map<string, StandaloneQuizAttempt>()
  const attemptCountByUser = new Map<string, number>()
  for (const a of attempts) {
    attemptCountByUser.set(a.user_id, (attemptCountByUser.get(a.user_id) ?? 0) + 1)
    const existing = bestAttemptByUser.get(a.user_id)
    if (!existing || a.score > existing.score) bestAttemptByUser.set(a.user_id, a)
  }

  const dueDateByUser = new Map<string, string | null>()
  for (const a of assignments) dueDateByUser.set(a.user_id, a.due_date)

  // ── Top-level stats ─────────────────────────────────────────────────────
  const assignedCount = assignments.length
  const totalAttempts = attempts.length
  const attemptersWithBest = [...bestAttemptByUser.values()]
  const passedAttempters = attemptersWithBest.filter((a) => a.passed).length
  const passRate = attemptersWithBest.length > 0
    ? Math.round((passedAttempters / attemptersWithBest.length) * 100)
    : null
  const avgBestScore = attemptersWithBest.length > 0
    ? Math.round(attemptersWithBest.reduce((s, a) => s + a.score, 0) / attemptersWithBest.length)
    : null

  // ── Per-employee rows (one per user) ────────────────────────────────────
  // Status: Passed/Failed if they attempted, else Not Started (assignment-only).
  const rows: ResultRow[] = userIds.map((uid) => {
    const prof = profilesById.get(uid)
    const best = bestAttemptByUser.get(uid)
    const count = attemptCountByUser.get(uid) ?? 0
    return {
      userId: uid,
      userName: prof?.full_name ?? prof?.email ?? uid,
      email: prof?.email ?? null,
      dueDate: dueDateByUser.get(uid) ?? null,
      attemptCount: count,
      bestAttempt: best
        ? {
            // Coerce StandaloneQuizAttempt → QuizAttempt-compatible shape so
            // the shared AnswersModal renders without changes (it doesn't
            // need video_id and falls back to standaloneTitleByQuizId).
            id: best.id,
            user_id: best.user_id,
            quiz_id: best.quiz_id,
            video_id: null,
            score: best.score,
            passed: best.passed,
            taken_at: best.taken_at,
            answers: best.answers ?? null,
          }
        : null,
    }
  })

  // Sort: attempters first (most recent attempt at top), then Not Started.
  rows.sort((a, b) => {
    if (a.bestAttempt && b.bestAttempt) return b.bestAttempt.taken_at.localeCompare(a.bestAttempt.taken_at)
    if (a.bestAttempt) return -1
    if (b.bestAttempt) return 1
    return a.userName.localeCompare(b.userName)
  })

  return (
    <div className="p-4 sm:p-6 w-full max-w-5xl mx-auto">
      <Link
        href="/admin/quizzes"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Quizzes
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-50">{quizData.title}</h1>
        {quizData.description && (
          <p className="text-zinc-400 text-sm mt-1 leading-relaxed">{quizData.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500 flex-wrap">
          <span>{quizData.questions.length} question{quizData.questions.length !== 1 ? 's' : ''}</span>
          <span>Passing: {quizData.passing_score}%</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Assigned" value={assignedCount} />
        <StatCard label="Attempts" value={totalAttempts} />
        <StatCard
          label="Pass Rate"
          value={passRate == null ? '—' : `${passRate}%`}
          tone={passRate == null ? 'neutral' : passRate >= 70 ? 'good' : 'warn'}
        />
        <StatCard
          label="Avg Score"
          value={avgBestScore == null ? '—' : `${avgBestScore}%`}
          tone={avgBestScore == null ? 'neutral' : avgBestScore >= quizData.passing_score ? 'good' : 'warn'}
        />
      </div>

      <ResultsClient
        quizTitle={quizData.title}
        passingScore={quizData.passing_score}
        rows={rows}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  tone?: 'good' | 'warn' | 'neutral'
}) {
  const valueColor =
    tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-zinc-50'
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
    </div>
  )
}
