import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadReferencePage } from '@/lib/library'
import LibraryTopBar from '../../../LibraryTopBar'
import ReferencePageBody from '@/components/cert/ReferencePageBody'
import ReferenceFootnote from '../../ReferenceFootnote'

// Standalone lesson (text) page. Same block / rich-text rendering as the
// cert stepper, read-only. Ricky Bobby's lesson-page citations land here.
export default async function LibraryTextPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const page = await loadReferencePage(supabase, id)
  if (!page) notFound()
  if (page.kind === 'plant') redirect(`/library/plant/${page.id}`)
  if (page.kind === 'video') {
    if (page.video_id) redirect(`/library/video/${page.video_id}`)
    notFound()
  }

  const title = page.title || page.lessonTitle || 'Lesson page'
  const context = [page.lessonTitle, page.sectionName].filter(Boolean).join(' · ')

  return (
    <>
      <LibraryTopBar title={title} subtitle={context || undefined} backHref="/library" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
          Lesson page
        </p>
        <ReferencePageBody page={page} />
        <ReferenceFootnote />
      </main>
    </>
  )
}
