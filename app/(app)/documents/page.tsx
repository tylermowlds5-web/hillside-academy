import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { DocumentRow, Category } from '@/lib/types'
import DocumentsViewClient from './DocumentsViewClient'

export default async function EmployeeDocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: documents }, { data: categories }] = await Promise.all([
    supabase.from('documents').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
  ])

  return (
    <DocumentsViewClient
      documents={(documents ?? []) as DocumentRow[]}
      categories={(categories ?? []) as Category[]}
    />
  )
}
