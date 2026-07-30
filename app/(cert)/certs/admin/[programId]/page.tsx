import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CertProgram, CertRequirement, Profile, JobRole, UserJobRole, Video } from '@/lib/types'
import ProgramDetailsForm from '../ProgramDetailsForm'
import ProgramEditorClient, { type EditorModule } from './ProgramEditorClient'

export default async function EditCertProgramPage(props: {
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

  const [
    { data: requirements },
    { data: allVideos },
    { data: employees },
    { data: roles },
    { data: userRoles },
    { data: assignments },
    { data: groups },
  ] = await Promise.all([
    supabase
      .from('cert_requirements')
      .select('*')
      .eq('program_id', programId)
      .order('sort_order')
      .returns<CertRequirement[]>(),
    supabase.from('videos').select('*').order('title').returns<Video[]>(),
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'employee')
      .eq('is_active', true)
      .order('full_name')
      .returns<Profile[]>(),
    supabase.from('roles').select('*').order('name').returns<JobRole[]>(),
    supabase.from('user_roles').select('*').returns<UserJobRole[]>(),
    supabase
      .from('cert_assignments')
      .select('user_id')
      .eq('program_id', programId)
      .returns<{ user_id: string }[]>(),
    supabase
      .from('cert_question_groups')
      .select('id, requirement_id, cert_questions ( id )')
      .returns<{ id: string; requirement_id: string; cert_questions: { id: string }[] }[]>(),
  ])

  const videoById = new Map((allVideos ?? []).map((v) => [v.id, v]))
  const groupCountByReq = new Map<string, { groups: number; questions: number }>()
  for (const g of groups ?? []) {
    const entry = groupCountByReq.get(g.requirement_id) ?? { groups: 0, questions: 0 }
    entry.groups++
    entry.questions += g.cert_questions.length
    groupCountByReq.set(g.requirement_id, entry)
  }

  const modules: EditorModule[] = (requirements ?? []).map((r) => {
    const counts = groupCountByReq.get(r.id) ?? { groups: 0, questions: 0 }
    const base = {
      id: r.id,
      passScore: r.quiz_pass_score,
      drawCount: r.quiz_draw_count,
      groupCount: counts.groups,
      questionCount: counts.questions,
    }
    if (r.lesson_title) {
      return {
        ...base,
        kind: 'lesson' as const,
        title: r.lesson_title,
        lessonBody: r.lesson_body ?? '',
        lessonImageUrl: r.lesson_image_url,
      }
    }
    if (r.video_id) {
      return {
        ...base,
        kind: 'video' as const,
        title: videoById.get(r.video_id)?.title ?? 'Video (removed)',
        videoId: r.video_id,
      }
    }
    if (r.standalone_quiz_id) {
      return { ...base, kind: 'hu-quiz' as const, title: 'HU standalone quiz' }
    }
    return { ...base, kind: 'hu-path' as const, title: 'HU learning path' }
  })

  const usedVideoIds = (requirements ?? []).map((r) => r.video_id).filter(Boolean) as string[]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/certs/admin"
        className="inline-flex items-center gap-1.5 text-sm text-plum/60 hover:text-plum mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Certifications
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-plum truncate">{program.name}</h1>
        <Link
          href={`/certs/admin/${programId}/results`}
          className="flex-shrink-0 px-4 py-2 rounded-lg border border-plum/20 hover:border-plum/40 text-plum/80 text-sm font-medium transition-colors"
        >
          View results
        </Link>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-plum/10 bg-white shadow-sm p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50 mb-4">
            Program details
          </h2>
          <ProgramDetailsForm
            programId={program.id}
            initialName={program.name}
            initialDescription={program.description ?? ''}
            initialValidityMonths={program.validity_months}
            initialIsActive={program.is_active}
          />
        </section>

        <ProgramEditorClient
          programId={program.id}
          initialModules={modules}
          allVideos={allVideos ?? []}
          usedVideoIds={usedVideoIds}
          employees={employees ?? []}
          roles={roles ?? []}
          userRoles={userRoles ?? []}
          initialAssignedIds={(assignments ?? []).map((a) => a.user_id)}
        />
      </div>
    </div>
  )
}
