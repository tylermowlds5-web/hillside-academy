import { createAdminClient } from './supabase/admin'
import { embedTexts, embeddingProvider } from './embeddings'
import type { RickyRetrievedSource } from './types'

// ── Per-question retrieval for Ricky Bobby ───────────────────────────────
// Three searches run in parallel over knowledge_index and are merged:
//   1. plant-name match — any plant page whose common / also-called /
//      botanical name appears in the question (pinned to the top)
//   2. vector search   — cosine similarity on the question's embedding
//      (skipped when no embedding provider is configured)
//   3. full-text search — Postgres websearch over title+text (keyword
//      recall, and the whole story when there are no embeddings)
// Vector and text results are fused with reciprocal-rank fusion, then the
// top hits are handed to the prompt with their titles and URLs. Anyone can
// ask anything: there is no cert gating here on purpose.

export type RetrievedHit = RickyRetrievedSource & { id: string; text: string }

export type RetrievalResult = {
  hits: RetrievedHit[]
  // The text that was actually searched (may include the previous turn).
  query: string
  provider: string | null
}

const MAX_HITS = 8
const MAX_PLANT_HITS = 3
// Prompt budget: total characters of retrieved text sent to the model.
const MAX_CONTEXT_CHARS = 14_000
const MAX_HIT_CHARS = 4_000

type IndexHit = {
  id: string
  source_table: string
  source_id: string
  kind: string
  title: string
  url: string
  text: string
  score: number
}

// ── Plant-name matching ───────────────────────────────────────────────────

const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'when', 'where', 'why', 'who', 'does', 'do', 'did', 'can', 'should', 'are', 'was', 'were', 'you', 'our', 'your', 'this', 'that', 'about', 'from', 'into', 'have', 'has', 'not', 'but', 'they', 'them', 'there', 'their', 'will', 'would', 'could'])

// Alias words too generic to count as a name on their own.
const GENERIC = new Set(['green', 'red', 'blue', 'white', 'purple', 'yellow', 'golden', 'gold', 'black', 'silver', 'japanese', 'chinese', 'english', 'american', 'european', 'dwarf', 'common', 'giant', 'tree', 'shrub', 'bush', 'vine', 'plant', 'grass', 'flower', 'hedge', 'spp', 'variegated', 'weeping', 'creeping', 'climbing', 'evergreen', 'ornamental', 'compact', 'standard', 'little', 'big', 'sweet', 'wild', 'false', 'mock', 'winter', 'summer', 'spring', 'fall', 'autumn', 'blood', 'fire', 'burning'])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular)
}

// "boxwoods" → "boxwood", "lilies" → "lily"; leaves short and -ss words alone.
function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

// Score 1 = a whole alias appears in the question; 0.6 = only the alias's
// distinctive last word does ("arborvitae" for "Emerald Green Arborvitae").
export function plantNameScore(question: string, aliases: string[]): number {
  const qTokens = tokens(question)
  const qNorm = ` ${qTokens.join(' ')} `
  let best = 0
  for (const alias of aliases) {
    const aTokens = tokens(alias)
    if (aTokens.length === 0) continue
    if (qNorm.includes(` ${aTokens.join(' ')} `)) return 1
    const last = aTokens[aTokens.length - 1]
    if (last.length >= 5 && !GENERIC.has(last) && qTokens.includes(last)) best = Math.max(best, 0.6)
  }
  return best
}

async function plantMatches(question: string): Promise<IndexHit[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('knowledge_index')
    .select('id, title, aliases')
    .neq('aliases', '{}')
    .returns<{ id: string; title: string; aliases: string[] }[]>()
  if (error) {
    console.error('[knowledge-retrieval] alias read failed:', error.message)
    return []
  }
  const scored = (data ?? [])
    .map((row) => ({ id: row.id, score: plantNameScore(question, row.aliases) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PLANT_HITS)
  if (scored.length === 0) return []

  const { data: rows } = await db
    .from('knowledge_index')
    .select('id, source_table, source_id, kind, title, url, text')
    .in('id', scored.map((s) => s.id))
    .returns<Omit<IndexHit, 'score'>[]>()
  const scoreById = new Map(scored.map((s) => [s.id, s.score]))
  return (rows ?? [])
    .map((r) => ({ ...r, score: scoreById.get(r.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
}

// ── Vector + full-text ────────────────────────────────────────────────────

async function vectorMatches(query: string): Promise<IndexHit[]> {
  if (!embeddingProvider()) return []
  const db = createAdminClient()
  try {
    const [embedding] = await embedTexts([query], 'query')
    const { data, error } = await db.rpc('knowledge_search_vector', {
      query_embedding: embedding,
      match_count: 10,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as IndexHit[]
  } catch (err) {
    console.error('[knowledge-retrieval] vector search failed:', err instanceof Error ? err.message : err)
    return []
  }
}

// OR the content words so a long question still ranks pages that cover most
// of it (websearch AND-semantics would demand every word).
function toWebsearch(query: string): string {
  const words = [...new Set(tokens(query).filter((w) => w.length >= 3 && !STOP.has(w)))]
  return words.slice(0, 24).join(' or ')
}

async function textMatches(query: string): Promise<IndexHit[]> {
  const q = toWebsearch(query)
  if (!q) return []
  const db = createAdminClient()
  const { data, error } = await db.rpc('knowledge_search_text', { search_query: q, match_count: 10 })
  if (error) {
    console.error('[knowledge-retrieval] text search failed:', error.message)
    return []
  }
  return (data ?? []) as IndexHit[]
}

// ── Merge ─────────────────────────────────────────────────────────────────

// The text searched for a turn: the latest question, prefixed by the
// previous one when the follow-up is too short to stand alone ("and in
// winter?").
export function retrievalQuery(messages: { role: string; content: string }[]): string {
  const users = messages.filter((m) => m.role === 'user').map((m) => m.content.trim())
  const last = users[users.length - 1] ?? ''
  const prev = users[users.length - 2]
  return last.length < 40 && prev ? `${prev}\n${last}` : last
}

export async function retrieveKnowledge(query: string): Promise<RetrievalResult> {
  const provider = embeddingProvider()
  const [plants, vectors, texts] = await Promise.all([
    plantMatches(query),
    vectorMatches(query),
    textMatches(query),
  ])

  // Reciprocal-rank fusion of the two ranked lists.
  const fused = new Map<string, { hit: IndexHit; score: number; via: 'vector' | 'text' }>()
  const add = (list: IndexHit[], via: 'vector' | 'text') => {
    list.forEach((hit, rank) => {
      const prev = fused.get(hit.id)
      const inc = 1 / (60 + rank)
      if (prev) prev.score += inc
      else fused.set(hit.id, { hit, score: inc, via })
    })
  }
  add(vectors, 'vector')
  add(texts, 'text')

  const ordered: RetrievedHit[] = []
  const seen = new Set<string>()
  for (const p of plants) {
    seen.add(p.id)
    ordered.push({ ...p, via: 'plant' })
  }
  for (const { hit, score, via } of [...fused.values()].sort((a, b) => b.score - a.score)) {
    if (seen.has(hit.id)) continue
    seen.add(hit.id)
    ordered.push({ ...hit, score, via })
  }

  // Trim to the prompt budget.
  const hits: RetrievedHit[] = []
  let used = 0
  for (const h of ordered) {
    if (hits.length >= MAX_HITS) break
    const text = h.text.length > MAX_HIT_CHARS ? `${h.text.slice(0, MAX_HIT_CHARS)}…` : h.text
    if (used + text.length > MAX_CONTEXT_CHARS) continue
    used += text.length
    hits.push({ ...h, text, score: Math.round(h.score * 1000) / 1000 })
  }

  return { hits, query, provider: provider ? `${provider.name}/${provider.model}` : null }
}

// The block handed to the model inside the latest user turn.
export function formatSiteContent(hits: RetrievedHit[]): string {
  if (hits.length === 0) {
    return '=== SITE CONTENT ===\n(nothing on Hillside University matched this question)\n=== END SITE CONTENT ==='
  }
  const parts = hits.map(
    (h, i) => `[${i + 1}] Title: ${h.title} | Kind: ${h.kind} | Link: ${h.url}\n${h.text}`
  )
  return `=== SITE CONTENT (retrieved from Hillside University for this question) ===\n${parts.join('\n\n')}\n=== END SITE CONTENT ===`
}

export function toStoredSources(hits: RetrievedHit[]): RickyRetrievedSource[] {
  return hits.map(({ title, kind, url, source_table, source_id, via, score }) => ({
    title, kind, url, source_table, source_id, via, score,
  }))
}
