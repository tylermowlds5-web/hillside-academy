import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CertProgram, CertRequirement, QuizQuestion } from '@/lib/types'
import BankEditorClient, { type BankGroup } from './BankEditorClient'

export default async function CertBankEditorPage(props: {
  params: Promise<{ programId: string; requirementId: string }>
}) {
  const { programId, requirementId } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: program }, { data: requirement }, { data: groups }, { data: videoRow }, { data: standalone }] =
    await Promise.all([
      supabase.from('cert_programs').select('*').eq('id', programId).single<CertProgram>(),
      supabase
        .from('cert_requirements')
        .select('*')
        .eq('id', requirementId)
        .eq('program_id', programId)
        .single<CertRequirement>(),
      supabase
        .from('cert_question_groups')
        .select('id, label, image_url, sort_order, cert_questions ( id, question, sort_order )')
        .eq('requirement_id', requirementId)
        .order('sort_order')
        .returns<
          {
            id: string
            label: string | null
            image_url: string | null
            sort_order: number
            cert_questions: { id: string; question: QuizQuestion; sort_order: number }[]
          }[]
        >(),
      supabase
        .from('cert_requirements')
        .select('video_id, videos ( title )')
        .eq('id', requirementId)
        .maybeSingle<{ video_id: string | null; videos: { title: string } | null }>(),
      supabase
        .from('cert_questions')
        .select('question, sort_order')
        .eq('requirement_id', requirementId)
        .order('sort_order')
        .returns<{ question: QuizQuestion; sort_order: number }[]>(),
    ])

  if (!program || !requirement) notFound()

  const moduleTitle =
    requirement.lesson_title ?? videoRow?.videos?.title ?? 'Module'

  const bankGroups: BankGroup[] = (groups ?? []).map((g) => ({
    id: g.id,
    label: g.label ?? '',
    imageUrl: g.image_url,
    questions: g.cert_questions
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((q) => q.question),
  }))

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={`/certs/admin/${programId}`}
        className="inline-flex items-center gap-1.5 text-sm text-plum/60 hover:text-plum mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        {program.name}
      </Link>

      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-plum mb-1">Question Bank</h1>
      <p className="text-sm text-plum/50 mb-6">
        {moduleTitle} — each attempt draws {requirement.quiz_draw_count} random unit
        {requirement.quiz_draw_count === 1 ? '' : 's'} at pass mark {requirement.quiz_pass_score}%.
        A unit is either a standalone question (any type) or a photo group (one shared photo
        with linked questions beneath it, each scored separately).
      </p>

      <BankEditorClient
        requirementId={requirementId}
        initialGroups={bankGroups}
        initialStandalone={(standalone ?? []).map((q) => q.question)}
      />
    </div>
  )
}
