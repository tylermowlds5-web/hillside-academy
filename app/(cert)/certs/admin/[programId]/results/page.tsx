import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CertProgram, CertRequirement, Profile } from '@/lib/types'
import { fmtDate } from '@/lib/format-date'

// Per-module results for a cert program: who's attempted, lesson progress,
// best quiz score, and pass state. Admin RLS grants full reads through the
// admin's own session.

type LessonRow = { user_id: string; requirement_id: string; percent_watched: number; completed: boolean }
type AttemptRow = { user_id: string; requirement_id: string; score: number | null; passed: boolean | null; submitted_at: string | null }

export default async function CertResultsPage(props: {
  params: Promise<{ programId: string }>
}) {
  const { programId } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: program } = await supabase
    .from('cert_programs')
    .select('*')
    .eq('id', programId)
    .single<CertProgram>()
  if (!program) notFound()

  const { data: requirements } = await supabase
    .from('cert_requirements')
    .select('*, videos ( title )')
    .eq('program_id', programId)
    .order('sort_order')
    .returns<(CertRequirement & { videos: { title: string } | null })[]>()

  const reqs = requirements ?? []
  const reqIds = reqs.map((r) => r.id)

  const [{ data: assignments }, { data: awards }, lessonsRes, attemptsRes, banksRes, standaloneBankRes] = await Promise.all([
    supabase
      .from('cert_assignments')
      .select('user_id')
      .eq('program_id', programId)
      .returns<{ user_id: string }[]>(),
    supabase
      .from('cert_awards')
      .select('user_id, earned_at, expires_at, revoked_at')
      .eq('program_id', programId)
      .returns<{ user_id: string; earned_at: string; expires_at: string | null; revoked_at: string | null }[]>(),
    reqIds.length
      ? supabase
          .from('cert_lesson_progress')
          .select('user_id, requirement_id, percent_watched, completed')
          .in('requirement_id', reqIds)
          .returns<LessonRow[]>()
      : Promise.resolve({ data: [] as LessonRow[] }),
    reqIds.length
      ? supabase
          .from('cert_quiz_attempts')
          .select('user_id, requirement_id, score, passed, submitted_at')
          .in('requirement_id', reqIds)
          .returns<AttemptRow[]>()
      : Promise.resolve({ data: [] as AttemptRow[] }),
    reqIds.length
      ? supabase
          .from('cert_question_groups')
          .select('requirement_id')
          .in('requirement_id', reqIds)
          .returns<{ requirement_id: string }[]>()
      : Promise.resolve({ data: [] as { requirement_id: string }[] }),
    reqIds.length
      ? supabase
          .from('cert_questions')
          .select('requirement_id')
          .in('requirement_id', reqIds)
          .returns<{ requirement_id: string }[]>()
      : Promise.resolve({ data: [] as { requirement_id: string }[] }),
  ])

  const lessons = lessonsRes.data ?? []
  const attempts = (attemptsRes.data ?? []).filter((a) => a.submitted_at)
  const bankReqIds = new Set([
    ...(banksRes.data ?? []).map((b) => b.requirement_id),
    ...(standaloneBankRes.data ?? []).map((b) => b.requirement_id),
  ])

  // Roster: everyone assigned, anyone with activity, and anyone certified.
  const userIds = new Set<string>([
    ...(assignments ?? []).map((a) => a.user_id),
    ...lessons.map((l) => l.user_id),
    ...attempts.map((a) => a.user_id),
    ...(awards ?? []).map((a) => a.user_id),
  ])

  const { data: people } = userIds.size
    ? await supabase
        .from('profiles')
        .select('*')
        .in('id', [...userIds])
        .order('full_name')
        .returns<Profile[]>()
    : { data: [] as Profile[] }

  const awardBy = new Map((awards ?? []).map((a) => [a.user_id, a]))
  const lessonBy = new Map<string, LessonRow>()
  for (const l of lessons) lessonBy.set(`${l.user_id}:${l.requirement_id}`, l)
  const attemptsBy = new Map<string, AttemptRow[]>()
  for (const a of attempts) {
    const k = `${a.user_id}:${a.requirement_id}`
    const list = attemptsBy.get(k) ?? []
    list.push(a)
    attemptsBy.set(k, list)
  }

  const moduleTitle = (r: CertRequirement & { videos: { title: string } | null }) =>
    r.lesson_title ?? r.videos?.title ?? (r.standalone_quiz_id ? 'HU quiz' : 'HU path')

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={`/certs/admin/${programId}`}
        className="inline-flex items-center gap-1.5 text-sm text-plum/60 hover:text-plum mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        {program.name}
      </Link>

      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-plum mb-1">Results</h1>
      <p className="text-sm text-plum/50 mb-6">
        Per-module progress for everyone enrolled or active in this certification. Cert
        progress is separate from everyday HU watch history.
      </p>

      {(people ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-plum/10 px-4 py-10 text-center">
          <p className="text-sm text-plum/50">No enrollment or activity yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-plum/10 bg-white shadow-sm">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-tan text-left">
                <th className="px-4 py-3 font-semibold text-plum/70 sticky left-0 bg-tan">Employee</th>
                <th className="px-4 py-3 font-semibold text-plum/70 whitespace-nowrap">Certified</th>
                {reqs.map((r, i) => (
                  <th key={r.id} className="px-4 py-3 font-semibold text-plum/70 whitespace-nowrap">
                    <span className="text-plum/40 mr-1">{i + 1}.</span>
                    {moduleTitle(r)}
                    {bankReqIds.has(r.id) && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase text-plum/50">quiz</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-plum/10">
              {(people ?? []).map((p) => (
                <tr key={p.id} className="bg-white">
                  <td className="px-4 py-3 sticky left-0 bg-white">
                    <p className="font-medium text-plum whitespace-nowrap">{p.full_name ?? p.email}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {(() => {
                      const award = awardBy.get(p.id)
                      if (!award) return <span className="text-plum/30">—</span>
                      if (award.revoked_at)
                        return <span className="font-medium text-red-600">Revoked {fmtDate(award.revoked_at)}</span>
                      const expired =
                        award.expires_at && new Date(award.expires_at).getTime() < Date.now()
                      return (
                        <span className={`font-medium ${expired ? 'text-burgundy' : 'text-emerald-700'}`}>
                          {fmtDate(award.earned_at)}
                          {expired && ' (expired)'}
                        </span>
                      )
                    })()}
                  </td>
                  {reqs.map((r) => {
                    const lesson = lessonBy.get(`${p.id}:${r.id}`)
                    const atts = attemptsBy.get(`${p.id}:${r.id}`) ?? []
                    const hasBank = bankReqIds.has(r.id)
                    const passed = atts.some((a) => a.passed)
                    const best = atts.reduce<number | null>(
                      (m, a) => (a.score !== null && (m === null || a.score > m) ? a.score : m),
                      null
                    )
                    const moduleDone = Boolean(lesson?.completed && (!hasBank || passed))

                    return (
                      <td key={r.id} className="px-4 py-3 whitespace-nowrap">
                        {moduleDone ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {hasBank && best !== null ? `${best}%` : 'Done'}
                          </span>
                        ) : lesson || atts.length > 0 ? (
                          <span className="text-plum/60">
                            {lesson && !lesson.completed && `${lesson.percent_watched}% watched`}
                            {lesson?.completed && !passed && hasBank && (
                              <>
                                {atts.length === 0
                                  ? 'quiz not taken'
                                  : `best ${best ?? '—'}% · ${atts.length} attempt${atts.length === 1 ? '' : 's'}`}
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-plum/30">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
