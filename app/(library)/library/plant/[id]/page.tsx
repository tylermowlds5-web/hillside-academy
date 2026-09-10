import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadReferencePage, unbold } from '@/lib/library'
import LibraryTopBar from '../../../LibraryTopBar'
import ReferencePageBody from '@/components/cert/ReferencePageBody'
import ReferenceFootnote from '../../ReferenceFootnote'

// Standalone plant reference page. Same PlantPage rendering as the cert
// stepper, but read-only: no module gate, no progress, no next/back.
// Ricky Bobby's plant citations land here.
export default async function LibraryPlantPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const page = await loadReferencePage(supabase, id)
  if (!page) notFound()
  // Wrong route for this page's kind — send it where it renders.
  if (page.kind === 'text') redirect(`/library/page/${page.id}`)
  if (page.kind === 'video') {
    if (page.video_id) redirect(`/library/video/${page.video_id}`)
    notFound()
  }

  const title = unbold(page.plant_data?.common_name) || page.title || 'Plant'
  const context = [page.lessonTitle, page.sectionName].filter(Boolean).join(' · ')

  return (
    <>
      <LibraryTopBar title={title} subtitle={context || undefined} backHref="/library" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
          Plant ID
        </p>
        <ReferencePageBody page={page} />
        <ReferenceFootnote />
      </main>
    </>
  )
}
