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

  // Every module + every program↔module link: this program's list comes from
  // its links (in position order); every other module feeds the "Add
  // existing module" picker, labeled with the programs it already lives in.
  const [
    { data: allModules },
    { data: allLinks },
    { data: allPrograms },
    { data: allVideos },
    { data: employees },
    { data: roles },
    { data: userRoles },
    { data: assignments },
    { data: groups },
    { data: standaloneQs },
    { data: pageRows },
  ] = await Promise.all([
    supabase.from('cert_requirements').select('*').order('created_at').returns<CertRequirement[]>(),
    supabase
      .from('cert_program_modules')
      .select('program_id, module_id, position')
      .returns<{ program_id: string; module_id: string; position: number }[]>(),
    supabase.from('cert_programs').select('id, name').returns<{ id: string; name: string }[]>(),
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
    supabase
      .from('cert_questions')
      .select('requirement_id')
      .not('requirement_id', 'is', null)
      .returns<{ requirement_id: string }[]>(),
    supabase
      .from('cert_pages')
      .select('requirement_id, needs_review')
      .returns<{ requirement_id: string; needs_review: boolean }[]>(),
  ])

  const videoById = new Map((allVideos ?? []).map((v) => [v.id, v]))
  const groupCountByReq = new Map<string, { groups: number; questions: number }>()
  for (const g of groups ?? []) {
    const entry = groupCountByReq.get(g.requirement_id) ?? { groups: 0, questions: 0 }
    entry.groups++
    entry.questions += g.cert_questions.length
    groupCountByReq.set(g.requirement_id, entry)
  }
  // Standalone questions count toward the module's question total too.
  for (const q of standaloneQs ?? []) {
    const entry = groupCountByReq.get(q.requirement_id) ?? { groups: 0, questions: 0 }
    entry.questions++
    groupCountByReq.set(q.requirement_id, entry)
  }
  const pageCountByReq = new Map<string, number>()
  const reviewCountByReq = new Map<string, number>()
  for (const p of pageRows ?? []) {
    pageCountByReq.set(p.requirement_id, (pageCountByReq.get(p.requirement_id) ?? 0) + 1)
    if (p.needs_review) reviewCountByReq.set(p.requirement_id, (reviewCountByReq.get(p.requirement_id) ?? 0) + 1)
  }

  const programName = new Map((allPrograms ?? []).map((p) => [p.id, p.name]))
  const linksByModule = new Map<string, { program_id: string; position: number }[]>()
  for (const l of allLinks ?? []) {
    const list = linksByModule.get(l.module_id) ?? []
    list.push(l)
    linksByModule.set(l.module_id, list)
  }
  const myLinks = (allLinks ?? [])
    .filter((l) => l.program_id === programId)
    .sort((a, b) => a.position - b.position)
  const inProgram = new Set(myLinks.map((l) => l.module_id))
  const moduleById = new Map((allModules ?? []).map((r) => [r.id, r]))

  const toEditorModule = (r: CertRequirement): EditorModule => {
    const counts = groupCountByReq.get(r.id) ?? { groups: 0, questions: 0 }
    const base = {
      id: r.id,
      passScore: r.quiz_pass_score,
      drawCount: r.quiz_draw_count,
      groupCount: counts.groups,
      questionCount: counts.questions,
      pageCount: pageCountByReq.get(r.id) ?? 0,
      reviewCount: reviewCountByReq.get(r.id) ?? 0,
      // Other programs this module also appears in (shared rows, not copies).
      sharedWith: (linksByModule.get(r.id) ?? [])
        .filter((l) => l.program_id !== programId)
        .map((l) => programName.get(l.program_id) ?? 'Unknown program'),
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
  }

  const modules: EditorModule[] = myLinks
    .map((l) => moduleById.get(l.module_id))
    .filter((r): r is CertRequirement => !!r)
    .map(toEditorModule)

  // Picker for "Add existing module": every module not already in this
  // program (sharedWith = the programs it currently lives in).
  const availableModules: EditorModule[] = (allModules ?? [])
    .filter((r) => !inProgram.has(r.id))
    .map(toEditorModule)
    .sort((a, b) => a.title.localeCompare(b.title))

  const usedVideoIds = modules.map((m) => m.videoId).filter(Boolean) as string[]

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
          availableModules={availableModules}
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
