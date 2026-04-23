import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Video, Progress, QuizAttempt, Quiz } from '@/lib/types'
import AutoRefresh from './AutoRefresh'

type ProgressCell = { percent: number; completed: boolean }

function ProgressTd({ cell }: { cell: ProgressCell | null }) {
  if (!cell) return <td className="px-3 py-3 text-center text-zinc-700">—</td>

  const { percent, completed } = cell
  const pct = Math.round(percent)
  const color = completed ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-zinc-700'
  const textColor = completed ? 'text-emerald-400' : pct > 0 ? 'text-amber-400' : 'text-zinc-600'

  return (
    <td className="px-3 py-3 text-center">
      <div className="flex flex-col items-center gap-1">
        <span className={`text-sm font-semibold ${textColor}`}>{pct}%</span>
        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        {completed && (
          <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </div>
    </td>
  )
}

export default async function AdminPage() {
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

  const [
    { data: employees },
    { data: videos },
    { data: assignments },
    { data: allProgress },
    { data: quizzes },
    { data: quizAttempts },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'),
    supabase.from('videos').select('*').order('created_at'),
    supabase.from('assignments').select('user_id, video_id'),
    supabase.from('progress').select('*'),
    supabase.from('quizzes').select('id, video_id, passing_score'),
    supabase.from('quiz_attempts').select('user_id, quiz_id, score, passed'),
  ])

  const typedEmployees = (employees ?? []) as Profile[]
  const typedVideos = (videos ?? []) as Video[]
  const typedAssignments = (assignments ?? []) as { user_id: string; video_id: string }[]
  const typedProgress = (allProgress ?? []) as Progress[]
  const typedQuizzes = (quizzes ?? []) as Quiz[]
  const typedAttempts = (quizAttempts ?? []) as (QuizAttempt & { quiz_id: string })[]

  // Lookup maps
  const assignedSet = new Set(typedAssignments.map((a) => `${a.user_id}:${a.video_id}`))
  const progressMap = new Map<string, Progress>()
  for (const p of typedProgress) progressMap.set(`${p.user_id}:${p.video_id}`, p)

  const quizByVideo = new Map<string, Quiz>()
  for (const q of typedQuizzes) quizByVideo.set(q.video_id, q)

  // Best quiz attempt per user/quiz
  const bestAttemptMap = new Map<string, { score: number; passed: boolean }>()
  for (const a of typedAttempts) {
    const key = `${a.user_id}:${a.quiz_id}`
    const existing = bestAttemptMap.get(key)
    if (!existing || a.score > existing.score) bestAttemptMap.set(key, a)
  }

  // Stats
  const totalAssigned = typedAssignments.length
  const completedCount = typedProgress.filter((p) => p.completed).length
  const avgPercent =
    typedProgress.length > 0
      ? Math.round(typedProgress.reduce((s, p) => s + p.percent_watched, 0) / typedProgress.length)
      : 0
  const quizPassCount = [...bestAttemptMap.values()].filter((a) => a.passed).length

  return (
    <div className="p-4 sm:p-6 w-full max-w-full">
      <AutoRefresh intervalMs={30000} />
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Progress Report</h1>
          <p className="text-zinc-400 text-sm mt-1">Video completion and quiz results by employee</p>
        </div>
        <a
          href="/api/admin/export"
          download
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Employees</p>
          <p className="text-3xl font-bold text-zinc-50 mt-1">{typedEmployees.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Assigned</p>
          <p className="text-3xl font-bold text-zinc-50 mt-1">{totalAssigned}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Completions</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">{completedCount}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Quiz Passes</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">{quizPassCount}</p>
        </div>
      </div>

      {/* Overall avg */}
      {totalAssigned > 0 && (
        <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-zinc-300">Average watch completion across all assignments</span>
            <span className="text-sm font-semibold text-emerald-400">{avgPercent}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${avgPercent}%` }} />
          </div>
        </div>
      )}

      {/* Grid */}
      {typedEmployees.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-zinc-400">No employees found.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium sticky left-0 bg-zinc-900 min-w-[200px]">
                    Employee
                  </th>
                  <th className="text-center px-3 py-3 text-zinc-400 font-medium">Assigned</th>
                  <th className="text-center px-3 py-3 text-zinc-400 font-medium">Done</th>
                  <th className="text-center px-3 py-3 text-zinc-400 font-medium">Avg %</th>
                  {typedVideos.map((v) => (
                    <th key={v.id} className="text-center px-3 py-3 text-zinc-400 font-medium min-w-[110px] max-w-[150px]">
                      <span className="block truncate text-xs" title={v.title}>{v.title}</span>
                      {quizByVideo.has(v.id) && (
                        <span className="block text-[10px] text-zinc-600 font-normal">+ quiz</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {typedEmployees.map((emp) => {
                  const empAssigned = typedVideos.filter((v) => assignedSet.has(`${emp.id}:${v.id}`))
                  const done = empAssigned.filter((v) => progressMap.get(`${emp.id}:${v.id}`)?.completed).length
                  const withProg = empAssigned.filter((v) => (progressMap.get(`${emp.id}:${v.id}`)?.percent_watched ?? 0) > 0)
                  const avg = withProg.length > 0
                    ? Math.round(withProg.reduce((s, v) => s + (progressMap.get(`${emp.id}:${v.id}`)?.percent_watched ?? 0), 0) / withProg.length)
                    : 0

                  return (
                    <tr key={emp.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-zinc-900 hover:bg-zinc-800/30">
                        <Link
                          href={`/admin/employees/${emp.id}`}
                          className="flex items-center gap-2.5 group"
                        >
                          <div className="w-7 h-7 rounded-full bg-emerald-900 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-emerald-400">
                              {(emp.full_name ?? emp.email ?? '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-zinc-100 font-medium text-sm group-hover:text-emerald-400 transition-colors truncate">
                              {emp.full_name ?? emp.email}
                            </p>
                            {emp.full_name && (
                              <p className="text-zinc-500 text-xs truncate">{emp.email}</p>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-center text-zinc-300 font-medium">{empAssigned.length}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-medium ${done > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>{done}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-zinc-300 font-medium">
                        {empAssigned.length > 0 ? `${avg}%` : '—'}
                      </td>

                      {typedVideos.map((v) => {
                        if (!assignedSet.has(`${emp.id}:${v.id}`)) {
                          return <td key={v.id} className="px-3 py-3 text-center text-zinc-700">—</td>
                        }
                        const prog = progressMap.get(`${emp.id}:${v.id}`) ?? null
                        const quiz = quizByVideo.get(v.id) ?? null
                        const best = quiz ? bestAttemptMap.get(`${emp.id}:${quiz.id}`) ?? null : null
                        const pct = prog ? Math.round(prog.percent_watched) : 0
                        const isInProgress = !prog?.completed && pct > 5

                        return (
                          <td key={v.id} className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              {/* Video progress */}
                              <span className={`text-sm font-semibold ${
                                prog?.completed ? 'text-emerald-400' : pct > 5 ? 'text-amber-400' : 'text-zinc-600'
                              }`}>
                                {pct}%
                              </span>
                              <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${prog?.completed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {prog?.completed ? (
                                <span className="text-[10px] text-emerald-500 font-medium">Completed</span>
                              ) : isInProgress ? (
                                <span className="text-[10px] text-amber-500 font-medium">In Progress</span>
                              ) : null}
                              {/* Quiz badge */}
                              {quiz && (
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${
                                  best?.passed
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : best
                                    ? 'bg-red-500/15 text-red-400'
                                    : 'bg-zinc-800 text-zinc-600'
                                }`}>
                                  {best ? `Q: ${best.score}%` : 'No quiz'}
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-zinc-800 flex items-center gap-6 text-xs text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-emerald-500 rounded-full inline-block" />Video completed</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-amber-500 rounded-full inline-block" />In progress</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-zinc-700 rounded-full inline-block" />Not started</span>
            <span>— Not assigned · Click employee name for full detail</span>
          </div>
        </div>
      )}
    </div>
  )
}
