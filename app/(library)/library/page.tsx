import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { PlantData } from '@/lib/types'
import { unbold } from '@/lib/library'
import LibraryTopBar from '../LibraryTopBar'
import LibraryBrowser, { type LibraryPage, type LibraryPlant, type LibraryVideo } from './LibraryBrowser'

type PageRow = {
  id: string
  kind: 'video' | 'text' | 'plant'
  title: string | null
  requirement_id: string
  category_id: string | null
  plant_data: PlantData | null
}

type VideoRow = {
  id: string
  title: string
  thumbnail_url: string | null
  category: string | null
  sub_category: string | null
  duration: number | null
}

// Browsable reference library: every published plant page, training video,
// and lesson page on the site, searchable, outside any certification. Same
// visibility rule as Ricky Bobby's index — drafts (needs_review) are absent.
export default async function LibraryIndexPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [pagesRes, videosRes, modulesRes, catsRes] = await Promise.all([
    supabase
      .from('cert_pages')
      .select('id, kind, title, requirement_id, category_id, plant_data')
      .eq('needs_review', false)
      .in('kind', ['plant', 'text'])
      .order('sort_order')
      .returns<PageRow[]>(),
    supabase
      .from('videos')
      .select('id, title, thumbnail_url, category, sub_category, duration')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .returns<VideoRow[]>(),
    supabase.from('cert_requirements').select('id, lesson_title').returns<{ id: string; lesson_title: string | null }[]>(),
    supabase.from('cert_categories').select('id, name').returns<{ id: string; name: string }[]>(),
  ])

  const lessonById = new Map((modulesRes.data ?? []).map((m) => [m.id, m.lesson_title]))
  const sectionById = new Map((catsRes.data ?? []).map((c) => [c.id, c.name]))

  const plants: LibraryPlant[] = []
  const pages: LibraryPage[] = []
  for (const p of pagesRes.data ?? []) {
    const lesson = lessonById.get(p.requirement_id) ?? null
    const section = p.category_id ? (sectionById.get(p.category_id) ?? null) : null
    if (p.kind === 'plant') {
      if (!p.plant_data) continue
      const name = unbold(p.plant_data.common_name) || p.title || ''
      if (!name) continue
      const photos = (p.plant_data.photos ?? []).filter((ph) => ph.url)
      plants.push({
        id: p.id,
        name,
        botanical: unbold(p.plant_data.botanical_name) || null,
        alsoCalled: unbold(p.plant_data.also_called?.value) || null,
        plantType: unbold(p.plant_data.plant_type) || null,
        photo: photos[0]?.url ?? p.plant_data.photo_url ?? null,
        lesson,
        section,
      })
      continue
    }
    const title = p.title || lesson
    if (!title) continue
    pages.push({ id: p.id, title, lesson, section })
  }
  plants.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  pages.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

  const videos: LibraryVideo[] = (videosRes.data ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnail_url,
    category: [v.category, v.sub_category].filter(Boolean).join(' › ') || null,
    duration: v.duration,
  }))

  return (
    <>
      <LibraryTopBar title="Library" subtitle="Plants, videos, and reference pages" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">Reference</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-plum sm:text-4xl">Library</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-plum/60 sm:text-base">
            Everything on Hillside University, open to read any time. Nothing here counts toward a
            certification — open the module from Certifications for that.
          </p>
        </div>

        <LibraryBrowser plants={plants} videos={videos} pages={pages} />
      </main>
    </>
  )
}
