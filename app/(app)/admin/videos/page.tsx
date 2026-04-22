import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video, Category, SubCategory } from '@/lib/types'
import AdminVideosClient from './AdminVideosClient'

export default async function AdminVideosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (profile?.role !== 'admin') redirect('/dashboard')

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
    <AdminVideosClient
      videos={(videos ?? []) as Video[]}
      categories={(categories ?? []) as Category[]}
      subCategories={(subCategories ?? []) as SubCategory[]}
    />
  )
}
