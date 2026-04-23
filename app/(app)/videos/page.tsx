import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video, Category, SubCategory } from '@/lib/types'
import LibraryClient from './LibraryClient'

export default async function VideosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: videos }, { data: categories }, { data: subCategories }] = await Promise.all([
    supabase
      .from('videos')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('sub_categories').select('*').order('sort_order'),
  ])

  return (
    <div className="p-4 sm:p-6 w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-50">Video Library</h1>
        <p className="text-zinc-400 text-sm mt-1">Browse all training videos</p>
      </div>
      <LibraryClient
        videos={(videos ?? []) as Video[]}
        categories={(categories ?? []) as Category[]}
        subCategories={(subCategories ?? []) as SubCategory[]}
      />
    </div>
  )
}
