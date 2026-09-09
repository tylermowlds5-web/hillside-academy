import { after } from 'next/server'
import { prune, reindex, reindexModuleContent, type KnowledgeSourceTable } from './knowledge-index'

// Keeps the Ricky Bobby knowledge index current from admin saves.
//
// Server actions call syncKnowledge(...) right after their write; the work
// is scheduled with Next's after() so it runs once the action's response is
// out the door — the admin never waits on an embedding call, and an indexer
// failure can't turn a successful save into an error (it's logged instead).
// The nightly full rebuild (app/api/cron/knowledge-rebuild) is the backstop
// for anything this misses.

export type KnowledgeSync = {
  // Re-index these source rows (a row that yields no entry is removed).
  reindex?: { table: KnowledgeSourceTable; ids: string[] }[]
  // Drop index rows whose source row no longer exists in these tables.
  prune?: KnowledgeSourceTable[]
}

export function syncKnowledge(sync: KnowledgeSync): void {
  after(async () => {
    try {
      for (const r of sync.reindex ?? []) {
        if (r.ids.length > 0) await reindex(r.table, r.ids)
      }
      for (const table of sync.prune ?? []) await prune(table)
    } catch (err) {
      console.error('[knowledge-sync] failed:', err instanceof Error ? err.message : err)
    }
  })
}

// Everything that hangs off a cert module (module row, pages, question
// bank) — for edits that add, remove, or relabel many rows at once.
export function syncCertModule(requirementId: string): void {
  after(async () => {
    try {
      await reindexModuleContent(requirementId)
    } catch (err) {
      console.error('[knowledge-sync] module sync failed:', err instanceof Error ? err.message : err)
    }
  })
}
