import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video } from '@/lib/types'
import LibraryTopBar from '../../../LibraryTopBar'
import LibraryVideoPlayer from './LibraryVideoPlayer'
import FormattedDescription from '@/app/(app)/watch/[videoId]/FormattedDescription'
import ReferenceFootnote from '../../ReferenceFootnote'

function fmtDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Standalone video reference. A plain player with full scrubbing — nothing
// here writes progress, unlike /watch (everyday HU) or a cert video module.
export default async function LibraryVideoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: video } = await supabase.from('videos').select('*').eq('id', id).maybeSingle<Video>()
  if (!video) notFound()

  const category = [video.category, video.sub_category].filter(Boolean).join(' › ')
  const duration = fmtDuration(video.duration)
  const meta = [category, duration].filter(Boolean).join(' · ')

  return (
    <>
      <LibraryTopBar title={video.title} subtitle={meta || undefined} backHref="/library" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
          Video
        </p>
        <h1 className="mb-5 font-serif text-2xl font-semibold text-plum sm:text-3xl">{video.title}</h1>

        <div className="overflow-hidden rounded-2xl bg-black shadow-md">
          <LibraryVideoPlayer url={video.url} title={video.title} />
        </div>

        {video.description && (
          <div className="mt-6 rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-8">
            <FormattedDescription
              text={video.description}
              className="text-sm leading-relaxed text-plum/80 sm:text-base [&_strong]:text-plum"
            />
          </div>
        )}

        <ReferenceFootnote />
      </main>
    </>
  )
}
