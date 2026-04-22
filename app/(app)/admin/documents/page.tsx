import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { DocumentRow, Category } from '@/lib/types'
import DocumentsClient from './DocumentsClient'

export default async function AdminDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: documents }, { data: categories }, { data: viewsCount }] = await Promise.all([
    supabase.from('documents').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('document_views').select('document_id'),
  ])

  const typedDocs = (documents ?? []) as DocumentRow[]
  const typedCats = (categories ?? []) as Category[]
  const viewCounts = new Map<string, number>()
  for (const v of (viewsCount ?? []) as { document_id: string }[]) {
    viewCounts.set(v.document_id, (viewCounts.get(v.document_id) ?? 0) + 1)
  }

  const docsWithCounts = typedDocs.map((d) => ({ ...d, viewCount: viewCounts.get(d.id) ?? 0 }))

  return <DocumentsClient documents={docsWithCounts} categories={typedCats} />
}
