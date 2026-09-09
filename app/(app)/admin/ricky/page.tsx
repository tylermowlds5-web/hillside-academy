import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { embeddingProvider } from '@/lib/embeddings'
import type { RickyQuestion } from '@/lib/types'
import RickyAdminClient, { type IndexStats, type QuestionRow } from './RickyAdminClient'

// Ricky Bobby admin: the last 50 questions with what was retrieved for
// each, the state of the knowledge index, and a Rebuild button.
export const metadata = { title: 'Ricky Bobby · Admin' }

export default async function RickyAdminPage() {
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

  // Both tables are admin-only under RLS; the service role also covers the
  // case where the admin's session can't see them for any reason.
  const admin = createAdminClient()
  const [questionsRes, indexRes, profilesRes] = await Promise.all([
    admin
      .from('ricky_questions')
      .select('id, user_id, question, answer, retrieved, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<RickyQuestion[]>(),
    admin
      .from('knowledge_index')
      .select('source_table, kind, updated_at, embedding')
      .returns<{ source_table: string; kind: string; updated_at: string; embedding: unknown }[]>(),
    admin.from('profiles').select('id, full_name, email').returns<{ id: string; full_name: string | null; email: string }[]>(),
  ])

  // Until RUN-THIS.sql has been applied these tables don't exist — show
  // that plainly instead of a blank page.
  const setupError = questionsRes.error?.message ?? indexRes.error?.message ?? null

  const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name ?? p.email]))
  const questions: QuestionRow[] = (questionsRes.data ?? []).map((q) => ({
    id: q.id,
    askedBy: q.user_id ? (nameById.get(q.user_id) ?? 'Unknown') : 'Unknown',
    question: q.question,
    answer: q.answer,
    retrieved: Array.isArray(q.retrieved) ? q.retrieved : [],
    createdAt: q.created_at,
  }))

  const rows = indexRes.data ?? []
  const byKind: Record<string, number> = {}
  let withEmbedding = 0
  let latest: string | null = null
  for (const r of rows) {
    byKind[r.kind || r.source_table] = (byKind[r.kind || r.source_table] ?? 0) + 1
    if (r.embedding != null) withEmbedding++
    if (!latest || r.updated_at > latest) latest = r.updated_at
  }
  const provider = embeddingProvider()
  const stats: IndexStats = {
    total: rows.length,
    withEmbedding,
    byKind,
    latestUpdate: latest,
    provider: provider ? `${provider.name} · ${provider.model}` : null,
  }

  return <RickyAdminClient questions={questions} stats={stats} setupError={setupError} />
}
