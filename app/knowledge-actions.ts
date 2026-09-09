'use server'

// Admin server actions for the Ricky Bobby knowledge index (/admin/ricky).

import { createClient } from '@/lib/supabase/server'
import { rebuildKnowledgeIndex, type RebuildSummary } from '@/lib/knowledge-index'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') throw new Error('Forbidden')
}

export type RebuildResult = { ok: true; summary: RebuildSummary } | { ok: false; error: string }

// "Rebuild index": full re-index of every content table, re-embedding only
// rows whose text changed, and dropping rows whose source was deleted.
// Returns a result object (not a throw) so the real reason reaches the admin
// in production, where thrown action errors are redacted.
export async function rebuildKnowledgeIndexAction(): Promise<RebuildResult> {
  await requireAdmin()
  try {
    const summary = await rebuildKnowledgeIndex()
    return { ok: true, summary }
  } catch (err) {
    console.error('[rebuildKnowledgeIndexAction] failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Rebuild failed' }
  }
}
