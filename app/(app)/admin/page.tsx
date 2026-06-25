import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Progress, QuizAttempt } from '@/lib/types'
import { getEffectiveProgress } from '@/lib/assignment-progress'
import { fmtDate } from '@/lib/format-date'
import AutoRefresh from './AutoRefresh'
import StorageUsageCard from './StorageUsageCard'

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
    { data: assignments },
    { data: allProgress },
    { data: quizAttempts },
    { data: watchEvents },
    { data: standaloneAttempts },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'),
    supabase.from('assignments').select('user_id, video_id, assigned_at, due_date'),
    supabase.from('progress').select('*'),
    supabase.from('quiz_attempts').select('user_id, quiz_id, score, passed, taken_at'),
    supabase.from('video_watch_events').select('user_id, watched_at'),
    supabase.from('standalone_quiz_attempts').select('user_id, quiz_id, score, passed, taken_at'),
  ])

  const typedEmployees = (employees ?? []) as Profile[]
  const typedAssignments = (assignments ?? []) as { user_id: string; video_id: string; assigned_at: string; due_date: string | null }[]
  const typedProgress = (allProgress ?? []) as Progress[]
  const typedAttempts = (quizAttempts ?? []) as Pick<QuizAttempt, 'user_id' | 'quiz_id' | 'score' | 'passed' | 'taken_at'>[]
  const typedWatchEvents = (watchEvents ?? []) as { user_id: string; watched_at: string }[]
  const typedStandaloneAttempts = (standaloneAttempts ?? []) as { user_id: string; quiz_id: string; score: number; passed: boolean; taken_at: string }[]

  // Most recent activity timestamp per user from each source, so "Last Active"
  // reflects real activity even when last_login was never set.
  const latestWatchEventByUser = new Map<string, string>()
  for (const e of typedWatchEvents) {
    const cur = latestWatchEventByUser.get(e.user_id)
    if (e.watched_at && (!cur || e.watched_at > cur)) latestWatchEventByUser.set(e.user_id, e.watched_at)
  }
  const latestQuizAttemptByUser = new Map<string, string>()
  for (const a of typedAttempts) {
    const cur = latestQuizAttemptByUser.get(a.user_id)
    if (a.taken_at && (!cur || a.taken_at > cur)) latestQuizAttemptByUser.set(a.user_id, a.taken_at)
  }
  const latestStandaloneAttemptByUser = new Map<string, string>()
  for (const a of typedStandaloneAttempts) {
    const cur = latestStandaloneAttemptByUser.get(a.user_id)
    if (a.taken_at && (!cur || a.taken_at > cur)) latestStandaloneAttemptByUser.set(a.user_id, a.taken_at)
  }

  // Returns the most recent (max) of a set of ISO timestamps, ignoring nulls.
  // ISO strings sort lexicographically in chronological order.
  const mostRecent = (...candidates: (string | null | undefined)[]): string | null => {
    let max: string | null = null
    for (const c of candidates) if (c && (!max || c > max)) max = c
    return max
  }

  // Lookup maps
  const progressMap = new Map<string, Progress>()
  for (const p of typedProgress) progressMap.set(`${p.user_id}:${p.video_id}`, p)

  // Best attempt per (user, quiz) — what we score the employee on. Counts BOTH
  // video-quiz attempts (quiz_attempts) and standalone-quiz attempts
  // (standalone_quiz_attempts), matching the employee detail page. quiz_id uuids
  // don't collide across the two tables, so a single map keyed by
  // `${user_id}:${quiz_id}` correctly counts distinct quizzes across both.
  const bestAttemptMap = new Map<string, { score: number; passed: boolean; taken_at: string }>()
  for (const a of [...typedAttempts, ...typedStandaloneAttempts]) {
    const key = `${a.user_id}:${a.quiz_id}`
    const existing = bestAttemptMap.get(key)
    if (!existing || a.score > existing.score) bestAttemptMap.set(key, a)
  }

  // Per-employee aggregation. Doing it in a single pass keeps each row's cells
  // consistent with each other and lets us compute "last active" across both
  // watch progress and quiz attempts.
  type EmployeeStats = {
    assigned: number
    // Assignment-scoped: how many assigned videos this employee has completed
    // and the corresponding percentage. Drives the "Completion" bar and the
    // top-level "Completions" counter.
    completedAssigned: number
    overallPercent: number
    // Activity stats — counted across ALL videos / quizzes, not gated on
    // assignment, so the report reflects what the employee actually did.
    videosWatched: number          // all progress rows with completed = true
    quizzesTaken: number           // distinct quizzes with at least one attempt
    avgQuizScore: number | null    // average best-score across quizzes taken
    lastActive: string | null      // max of any last_watched_at or taken_at
    // On-time completion — assignment-relative because it needs due dates.
    withDueDate: number            // assignments that actually have a due date
    onTimePercent: number | null   // null when the employee has 0 due-dated assignments
  }
  const stats = new Map<string, EmployeeStats>()

  for (const emp of typedEmployees) {
    // Every progress row for this user, including unassigned watches. The
    // activity stats count from here so they include anything the employee
    // actually watched, not just stuff that was assigned to them.
    const empProgress = typedProgress.filter((p) => p.user_id === emp.id)
    const videosWatched = empProgress.filter((p) => p.completed).length

    let lastActive: string | null = null
    for (const p of empProgress) {
      if (p.last_watched_at && (!lastActive || p.last_watched_at > lastActive)) {
        lastActive = p.last_watched_at
      }
    }

    // Assignment-scoped pass: drives the Completion bar plus the on-time
    // calculation (which needs each assignment's due_date).
    const empAssignments = typedAssignments.filter((a) => a.user_id === emp.id)
    let completedAssigned = 0
    let withDueDate = 0
    let onTime = 0
    for (const a of empAssignments) {
      const prog = progressMap.get(`${emp.id}:${a.video_id}`) ?? null
      const eff = getEffectiveProgress(prog, a.assigned_at)
      if (eff.completed) completedAssigned++

      if (a.due_date) {
        withDueDate++
        // We don't store a dedicated completed_at — last_watched_at on the
        // completed row is the best proxy. Compare as YYYY-MM-DD strings;
        // both sides are ISO so lexicographic order matches chronological.
        if (prog?.completed && prog.last_watched_at.slice(0, 10) <= a.due_date.slice(0, 10)) {
          onTime++
        }
      }
    }

    // Quiz aggregation across this employee's best attempts (across all quizzes
    // they've taken, not gated on assignment — anything they attempted counts).
    const empBest: { score: number; taken_at: string }[] = []
    for (const [key, val] of bestAttemptMap) {
      if (key.startsWith(`${emp.id}:`)) empBest.push(val)
    }
    const quizzesTaken = empBest.length
    const avgQuizScore = quizzesTaken > 0
      ? Math.round(empBest.reduce((s, x) => s + x.score, 0) / quizzesTaken)
      : null

    // Last Active = most recent of: last login, latest watch event, latest
    // video-quiz attempt, latest standalone-quiz attempt (and the progress
    // last_watched_at folded in above). Always reflects real activity even
    // when last_login was never recorded.
    lastActive = mostRecent(
      lastActive,
      emp.last_login,
      latestWatchEventByUser.get(emp.id),
      latestQuizAttemptByUser.get(emp.id),
      latestStandaloneAttemptByUser.get(emp.id),
    )

    stats.set(emp.id, {
      assigned: empAssignments.length,
      completedAssigned,
      overallPercent: empAssignments.length > 0
        ? Math.round((completedAssigned / empAssignments.length) * 100)
        : 0,
      videosWatched,
      quizzesTaken,
      avgQuizScore,
      lastActive,
      withDueDate,
      onTimePercent: withDueDate > 0 ? Math.round((onTime / withDueDate) * 100) : null,
    })
  }

  // Top-level stats (across all employees)
  const totalAssigned = typedAssignments.length
  const totalCompleted = [...stats.values()].reduce((s, x) => s + x.completedAssigned, 0)
  const totalQuizPasses = [...bestAttemptMap.values()].filter((a) => a.passed).length

  return (
    <div className="p-4 sm:p-6 w-full max-w-6xl mx-auto">
      <AutoRefresh intervalMs={30000} />

      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Progress Report</h1>
          <p className="text-zinc-400 text-sm mt-1">Per-employee training progress at a glance</p>
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

      {/* R2 storage usage — fetched client-side (and cached) so listing the
          bucket doesn't run on every dashboard load. */}
      <div className="mb-8 max-w-md">
        <StorageUsageCard />
      </div>

      {/* Top stats */}
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
          <p className="text-3xl font-bold text-emerald-400 mt-1">{totalCompleted}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Quiz Passes</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">{totalQuizPasses}</p>
        </div>
      </div>

      {/* Per-employee list */}
      {typedEmployees.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-zinc-400">No employees found.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[1.4fr_1fr_repeat(5,_minmax(0,_1fr))] gap-4 px-5 py-3 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500 font-medium">
            <div>Employee</div>
            <div>Completion</div>
            <div className="text-center">Videos Watched</div>
            <div className="text-center">Quizzes Taken</div>
            <div className="text-center">Avg Quiz Score</div>
            <div className="text-center">On Time</div>
            <div className="text-right">Last Active</div>
          </div>

          <ul className="divide-y divide-zinc-800">
            {typedEmployees.map((emp) => {
              const s = stats.get(emp.id)!
              return (
                <li key={emp.id}>
                  <Link
                    href={`/admin/employees/${emp.id}`}
                    className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_repeat(5,_minmax(0,_1fr))] gap-4 px-5 py-4 hover:bg-zinc-800/40 transition-colors items-center"
                  >
                    {/* Employee */}
                    <div className="flex items-center gap-3 col-span-2 md:col-span-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-emerald-900 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-emerald-400">
                          {(emp.full_name ?? emp.email ?? '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">
                          {emp.full_name ?? emp.email}
                        </p>
                        {emp.full_name && (
                          <p className="text-xs text-zinc-500 truncate">{emp.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Overall completion percentage with bar */}
                    <div className="flex items-center gap-2 col-span-2 md:col-span-1">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden min-w-0">
                        <div
                          className={`h-full rounded-full ${s.overallPercent >= 100 ? 'bg-emerald-500' : s.overallPercent > 0 ? 'bg-amber-500' : 'bg-zinc-700'}`}
                          style={{ width: `${s.overallPercent}%` }}
                        />
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${
                        s.overallPercent >= 100 ? 'text-emerald-400' : s.overallPercent > 0 ? 'text-amber-400' : 'text-zinc-500'
                      }`}>
                        {s.assigned > 0 ? `${s.overallPercent}%` : '—'}
                      </span>
                    </div>

                    {/* Videos watched — count across ALL videos with completed=true,
                        not gated on whether the video was assigned. */}
                    <div className="md:text-center">
                      <span className="text-[11px] uppercase tracking-wider text-zinc-500 mr-1.5 md:hidden">Videos</span>
                      <span className={`text-sm font-semibold ${s.videosWatched > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {s.videosWatched}
                      </span>
                    </div>

                    {/* Quizzes taken */}
                    <div className="md:text-center">
                      <span className="text-[11px] uppercase tracking-wider text-zinc-500 mr-1.5 md:hidden">Quizzes</span>
                      <span className={`text-sm font-semibold ${s.quizzesTaken > 0 ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {s.quizzesTaken}
                      </span>
                    </div>

                    {/* Avg quiz score */}
                    <div className="md:text-center">
                      <span className="text-[11px] uppercase tracking-wider text-zinc-500 mr-1.5 md:hidden">Avg quiz</span>
                      {s.avgQuizScore != null ? (
                        <span className={`text-sm font-semibold ${
                          s.avgQuizScore >= 70 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {s.avgQuizScore}%
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-600">—</span>
                      )}
                    </div>

                    {/* On-time completion — % of due-dated assignments completed
                        on or before the due date. N/A if no due dates are set. */}
                    <div className="md:text-center">
                      <span className="text-[11px] uppercase tracking-wider text-zinc-500 mr-1.5 md:hidden">On time</span>
                      {s.onTimePercent == null ? (
                        <span className="text-sm text-zinc-600">N/A</span>
                      ) : (
                        <span className={`text-sm font-semibold whitespace-nowrap ${
                          s.onTimePercent >= 80
                            ? 'text-emerald-400'
                            : s.onTimePercent >= 50
                            ? 'text-amber-400'
                            : 'text-red-400'
                        }`}>
                          {s.onTimePercent}% on time
                        </span>
                      )}
                    </div>

                    {/* Last active */}
                    <div className="md:text-right">
                      <span className="text-[11px] uppercase tracking-wider text-zinc-500 mr-1.5 md:hidden">Last active</span>
                      <span className="text-sm text-zinc-400 whitespace-nowrap">
                        {s.lastActive ? fmtDate(s.lastActive) : <span className="text-zinc-600">Never</span>}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>

          <p className="px-5 py-3 border-t border-zinc-800 text-xs text-zinc-500">
            Click an employee for their full progress breakdown.
          </p>
        </div>
      )}
    </div>
  )
}
