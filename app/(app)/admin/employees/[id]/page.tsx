import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Video, Progress, VideoWatchEvent, Session, QuizAttempt } from '@/lib/types'
import QuizResultsTable from './QuizResultsTable'
import { fmtDate, fmtTime } from '@/lib/format-date'

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

export default async function EmployeeDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (adminProfile?.role !== 'admin') redirect('/dashboard')

  const { data: empProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single<Profile>()
  if (!empProfile) notFound()

  const [
    { data: assignments },
    { data: allProgress },
    { data: watchEvents },
    { data: sessions },
    { data: quizAttempts },
    { data: quizzes },
    { data: allVideos },
    { data: documentViews },
  ] = await Promise.all([
    supabase
      .from('assignments')
      .select('video_id, due_date, videos(id, title, duration)')
      .eq('user_id', id),
    supabase.from('progress').select('*').eq('user_id', id),
    supabase
      .from('video_watch_events')
      .select('*, videos(title)')
      .eq('user_id', id)
      .order('watched_at', { ascending: false })
      .limit(100),
    supabase
      .from('sessions')
      .select('*')
      .eq('user_id', id)
      .order('logged_in_at', { ascending: false })
      .limit(30),
    supabase
      .from('quiz_attempts')
      .select('*')
      .eq('user_id', id)
      .order('taken_at', { ascending: false }),
    supabase.from('quizzes').select('id, video_id, passing_score'),
    supabase.from('videos').select('id, title'),
    supabase
      .from('document_views')
      .select('*, documents(title, file_type)')
      .eq('user_id', id)
      .order('viewed_at', { ascending: false }),
  ])

  type AssignRow = { video_id: string; due_date: string | null; videos: { id: string; title: string; duration: number | null } | null }
  const typedAssignments = (assignments ?? []) as unknown as AssignRow[]
  const typedProgress = (allProgress ?? []) as Progress[]
  const typedEvents = (watchEvents ?? []) as (VideoWatchEvent & { videos: { title: string } | null })[]
  const typedSessions = (sessions ?? []) as Session[]
  const typedAttempts = (quizAttempts ?? []) as QuizAttempt[]
  type QuizRow = { id: string; video_id: string; passing_score: number }
  const typedQuizzes = (quizzes ?? []) as unknown as QuizRow[]
  type VideoRow = { id: string; title: string }
  const typedAllVideos = (allVideos ?? []) as unknown as VideoRow[]
  type DocView = { id: string; user_id: string; document_id: string; viewed_at: string; documents: { title: string; file_type: string | null } | null }
  const typedDocViews = (documentViews ?? []) as unknown as DocView[]

  // Map quiz_id → passing_score
  const passingScoreByQuizId: Record<string, number> = {}
  for (const q of typedQuizzes) passingScoreByQuizId[q.id] = q.passing_score

  // Map video_id → title (for quiz attempts)
  const videoTitleById: Record<string, string> = {}
  for (const v of typedAllVideos) videoTitleById[v.id] = v.title

  // Also derive video title from quiz_id → video_id → title for attempts that
  // have quiz_id but may be missing video_id (older attempts)
  const quizVideoMap: Record<string, string> = {}
  for (const q of typedQuizzes) quizVideoMap[q.id] = q.video_id

  const progressMap = new Map<string, Progress>()
  for (const p of typedProgress) progressMap.set(p.video_id, p)

  const quizByVideo = new Map<string, QuizRow>()
  for (const q of typedQuizzes) quizByVideo.set(q.video_id, q)

  // Best attempt per quiz
  const bestAttemptByQuiz = new Map<string, typeof typedAttempts[0]>()
  for (const a of typedAttempts) {
    const existing = bestAttemptByQuiz.get(a.quiz_id)
    if (!existing || a.score > existing.score) bestAttemptByQuiz.set(a.quiz_id, a)
  }

  const totalAssigned = typedAssignments.length
  const completed = typedProgress.filter((p) => p.completed).length
  const totalSeconds = typedProgress.reduce((s, p) => s + (p.watch_time_seconds ?? 0), 0)
  const quizPasses = [...bestAttemptByQuiz.values()].filter((a) => a.passed).length
  const avgPercent = typedProgress.length > 0
    ? Math.round(typedProgress.reduce((s, p) => s + p.percent_watched, 0) / typedProgress.length)
    : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Progress Report
      </Link>

      {/* Employee header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-emerald-900 flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-emerald-400">
            {(empProfile.full_name ?? empProfile.email ?? '?').charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">{empProfile.full_name ?? empProfile.email}</h1>
          {empProfile.full_name && <p className="text-zinc-400 text-sm">{empProfile.email}</p>}
          <p className="text-zinc-600 text-xs mt-0.5 capitalize">{empProfile.role}</p>
        </div>
        <div className="ml-auto">
          <a
            href={`/api/admin/export?employee=${id}`}
            download
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </a>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        {[
          { label: 'Assigned', value: totalAssigned, color: 'text-zinc-50' },
          { label: 'Completed', value: completed, color: 'text-emerald-400' },
          { label: 'Avg Watched', value: `${avgPercent}%`, color: 'text-zinc-50' },
          { label: 'Time Spent', value: formatSeconds(totalSeconds), color: 'text-zinc-50' },
          { label: 'Quiz Passes', value: quizPasses, color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-8">
        {/* ── Per-video summary ─────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-zinc-200 mb-3">Video Summary</h2>
          {typedAssignments.length === 0 ? (
            <p className="text-sm text-zinc-500">No videos assigned.</p>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Video</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">% Watched</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">Quiz</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Last Watched</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-medium">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {typedAssignments.map((a) => {
                    const prog = progressMap.get(a.video_id)
                    const quiz = quizByVideo.get(a.video_id)
                    const best = quiz ? bestAttemptByQuiz.get(quiz.id) : null
                    const pct = prog ? Math.round(prog.percent_watched) : 0

                    return (
                      <tr key={a.video_id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-200 font-medium">
                          {a.videos?.title ?? a.video_id}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-semibold ${prog?.completed ? 'text-emerald-400' : pct > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                              {pct}%
                            </span>
                            <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${prog?.completed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            prog?.completed
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : pct > 0
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}>
                            {prog?.completed ? 'Completed' : pct > 0 ? 'In progress' : 'Not started'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!quiz ? (
                            <span className="text-zinc-700 text-xs">No quiz</span>
                          ) : best ? (
                            <span className={`text-xs font-semibold ${best.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                              {best.score}% {best.passed ? '✓' : '✗'}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-xs">Not taken</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-sm">
                          {prog ? fmtDate(prog.last_watched_at) : '—'}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs text-right">
                          {fmtDate(a.due_date)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Watch activity ────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-zinc-200 mb-3">Watch Activity</h2>
          {typedEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">No watch activity recorded yet.</p>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Time</th>
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Video</th>
                      <th className="text-center px-4 py-3 text-zinc-400 font-medium">% Watched</th>
                      <th className="text-center px-4 py-3 text-zinc-400 font-medium">Time Spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {typedEvents.map((e) => (
                      <tr key={e.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-2.5 text-zinc-300">
                          {fmtDate(e.watched_at)}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400">
                          {fmtTime(e.watched_at)}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-200 truncate max-w-[200px]">
                          {e.videos?.title ?? e.video_id}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="font-semibold text-zinc-300">{e.percent_watched}%</span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-zinc-400">
                          {formatSeconds(e.seconds_watched)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Quiz results ──────────────────────────────── */}
        <QuizResultsTable
          attempts={typedAttempts}
          passingScoreByQuizId={passingScoreByQuizId}
          videoTitleById={videoTitleById}
          quizVideoMap={quizVideoMap}
        />

        {/* ── Documents opened ────────────────────────────── */}
        {typedDocViews.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-zinc-200 mb-3">
              Documents Opened
              <span className="ml-2 text-xs font-normal text-zinc-500">{typedDocViews.length} view{typedDocViews.length !== 1 ? 's' : ''}</span>
            </h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Document</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {typedDocViews.map((v) => (
                    <tr key={v.id} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-2.5 text-zinc-200 truncate max-w-[300px]">
                        {v.documents?.title ?? 'Unknown document'}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400">{fmtDate(v.viewed_at)}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{fmtTime(v.viewed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Session log ───────────────────────────────── */}
        {typedSessions.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-zinc-200 mb-3">Login Sessions</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Login</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Logout</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {typedSessions.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-2.5 text-zinc-300">
                        {fmtDate(s.logged_in_at)}{' '}
                        <span className="text-zinc-500 text-xs">
                          {fmtTime(s.logged_in_at)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400">
                        {s.logged_out_at ? (
                          <>
                            {fmtDate(s.logged_out_at)}{' '}
                            <span className="text-zinc-600 text-xs">
                              {fmtTime(s.logged_out_at)}
                            </span>
                          </>
                        ) : (
                          <span className="text-emerald-400 text-xs">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-zinc-400">
                        {s.duration_minutes != null ? `${s.duration_minutes}m` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
