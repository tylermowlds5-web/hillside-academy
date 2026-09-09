// Embedding provider for the Ricky Bobby knowledge index.
//
// Anthropic doesn't offer an embeddings endpoint, so this uses whichever of
// these keys is present in the environment (first match wins):
//   VOYAGE_API_KEY  → Voyage AI voyage-3.5-lite (Anthropic's recommended
//                     embedding partner; 1024 dims by default)
//   OPENAI_API_KEY  → OpenAI text-embedding-3-small, asked for 1024 dims
// Both produce 1024-dim vectors so the knowledge_index.embedding column
// (vector(1024)) works with either. With NO key configured, indexing still
// runs (rows are stored without embeddings) and retrieval falls back to
// Postgres full-text search — Ricky keeps working, just with keyword
// matching instead of semantic search. Server-side only.

export const EMBEDDING_DIMS = 1024

export type EmbeddingProvider = { name: 'voyage' | 'openai'; model: string }

export function embeddingProvider(): EmbeddingProvider | null {
  if (process.env.VOYAGE_API_KEY) return { name: 'voyage', model: 'voyage-3.5-lite' }
  if (process.env.OPENAI_API_KEY) return { name: 'openai', model: 'text-embedding-3-small' }
  return null
}

// Per-request batch size. Both APIs accept far more, but smaller batches
// keep any single failure cheap to retry.
const BATCH_SIZE = 48
// Each entry is capped well under both models' token limits (the indexer
// already caps text at ~12k chars); this is a last-line guard.
const MAX_CHARS_PER_INPUT = 24_000

type EmbedResponse = { data?: { embedding: number[]; index: number }[]; error?: unknown; detail?: unknown }

async function postJson(url: string, apiKey: string, body: unknown): Promise<EmbedResponse> {
  // One retry on rate limit / transient server errors.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
    if (res.ok) return (await res.json()) as EmbedResponse
    const retryable = res.status === 429 || res.status >= 500
    const detail = await res.text().catch(() => '')
    if (!retryable || attempt === 2) {
      throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 300)}`)
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  throw new Error('Embedding request failed')
}

// Embeds `texts` in order. `inputType` lets Voyage tune document vs. query
// vectors (OpenAI has no equivalent; ignored there). Throws when no
// provider is configured — callers check embeddingProvider() first.
export async function embedTexts(
  texts: string[],
  inputType: 'document' | 'query'
): Promise<number[][]> {
  const provider = embeddingProvider()
  if (!provider) throw new Error('No embedding provider configured (set VOYAGE_API_KEY or OPENAI_API_KEY)')
  if (texts.length === 0) return []

  const out: number[][] = []
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts
      .slice(start, start + BATCH_SIZE)
      .map((t) => (t.trim() || '(empty)').slice(0, MAX_CHARS_PER_INPUT))

    let json: EmbedResponse
    if (provider.name === 'voyage') {
      json = await postJson('https://api.voyageai.com/v1/embeddings', process.env.VOYAGE_API_KEY!, {
        input: batch,
        model: provider.model,
        input_type: inputType,
        output_dimension: EMBEDDING_DIMS,
      })
    } else {
      json = await postJson('https://api.openai.com/v1/embeddings', process.env.OPENAI_API_KEY!, {
        input: batch,
        model: provider.model,
        dimensions: EMBEDDING_DIMS,
      })
    }

    const data = (json.data ?? []).slice().sort((a, b) => a.index - b.index)
    if (data.length !== batch.length) {
      throw new Error(`Embedding provider returned ${data.length} vectors for ${batch.length} inputs`)
    }
    for (const d of data) {
      if (!Array.isArray(d.embedding) || d.embedding.length !== EMBEDDING_DIMS) {
        throw new Error(`Embedding has ${d.embedding?.length ?? 0} dims, expected ${EMBEDDING_DIMS}`)
      }
      out.push(d.embedding)
    }
  }
  return out
}
