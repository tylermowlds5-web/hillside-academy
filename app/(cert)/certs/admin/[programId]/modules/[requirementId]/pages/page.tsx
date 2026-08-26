import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CertPage, CertProgram, CertRequirement } from '@/lib/types'
import PagesEditorClient, { type AdminPage, type PickerVideo } from './PagesEditorClient'

export default async function CertPagesEditorPage(props: {
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

  const [{ data: program }, { data: requirement }, { data: pages }, { data: allVideos }, { data: categories }] =
    await Promise.all([
      supabase.from('cert_programs').select('*').eq('id', programId).single<CertProgram>(),
      supabase
        .from('cert_requirements')
        .select('*')
        .eq('id', requirementId)
        .eq('program_id', programId)
        .single<CertRequirement>(),
      supabase
        .from('cert_pages')
        .select('*')
        .eq('requirement_id', requirementId)
        .order('sort_order')
        .returns<CertPage[]>(),
      supabase.from('videos').select('id, title, thumbnail_url').order('title').returns<PickerVideo[]>(),
      supabase
        .from('cert_categories')
        .select('id, name, sort_order')
        .eq('requirement_id', requirementId)
        .order('sort_order')
        .returns<{ id: string; name: string; sort_order: number }[]>(),
    ])

  if (!program || !requirement) notFound()
  // Pages belong to lesson modules only.
  if (!requirement.lesson_title) redirect(`/certs/admin/${programId}`)

  const videoTitle = new Map((allVideos ?? []).map((v) => [v.id, v.title]))
  const adminPages: AdminPage[] = (pages ?? []).map((p) => ({
    id: p.id,
    kind: p.kind,
    videoId: p.video_id,
    videoTitle: p.video_id ? (videoTitle.get(p.video_id) ?? 'Video (removed)') : null,
    title: p.title ?? '',
    body: p.body ?? '',
    imageUrl: p.image_url,
    imagePosition: p.image_position,
    categoryId: p.category_id,
    plantData: p.plant_data,
    blocks: p.blocks,
  }))

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={`/certs/admin/${programId}`}
        className="inline-flex items-center gap-1.5 text-sm text-plum/60 hover:text-plum mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        {program.name}
      </Link>

      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-plum mb-1">Lesson Pages</h1>
      <p className="text-sm text-plum/50 mb-6">
        {requirement.lesson_title} — employees work through pages in order (videos need the
        full watch, text pages complete on reading to the bottom), then take the module quiz.
        A lesson with no pages falls back to its single-page Settings content.
      </p>

      <PagesEditorClient
        requirementId={requirementId}
        initialPages={adminPages}
        allVideos={allVideos ?? []}
        initialCategories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  )
}
