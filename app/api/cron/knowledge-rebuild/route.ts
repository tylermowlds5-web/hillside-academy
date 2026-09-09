import { NextRequest } from 'next/server'
import { rebuildKnowledgeIndex } from '@/lib/knowledge-index'

// Nightly full rebuild of the Ricky Bobby knowledge index (Vercel cron, see
// vercel.json). Re-indexes every content row, re-embeds only rows whose
// text changed, and removes index rows whose source was deleted. Safe to
// run by hand: curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/knowledge-rebuild

// Embedding the whole site takes a few seconds; allow headroom.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await rebuildKnowledgeIndex()
    console.log(
      `[knowledge-rebuild cron] done — ${summary.total} entries, ${summary.embedded} embedded, ${summary.removed} removed, ${summary.durationMs}ms` +
        (summary.embeddingError ? ` (embedding error: ${summary.embeddingError})` : '')
    )
    return Response.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[knowledge-rebuild cron] failed:', err)
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'rebuild failed' },
      { status: 500 }
    )
  }
}
