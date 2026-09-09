import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SYSTEM_PROMPT, FALLBACK_CONTEXT } from '@/lib/hillside-ai-prompt'
import {
  formatSiteContent,
  retrievalQuery,
  retrieveKnowledge,
  toStoredSources,
} from '@/lib/knowledge-retrieval'

// User-selected model for the crew chat. Thinking is disabled deliberately:
// claude-sonnet-5 runs adaptive thinking when the field is omitted, which
// would silently spend the 1024-token budget and delay the first visible
// token — this is a fast Q&A chat, not a reasoning workload.
const CLAUDE_MODEL = 'claude-sonnet-5'
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 4_000
const MAX_TOTAL_CHARS = 32_000

type ChatMessage = { role: 'user' | 'assistant'; content: string }

// Returns the validated messages array, or an error string for a 400.
function validateMessages(value: unknown): ChatMessage[] | string {
  if (!Array.isArray(value) || value.length === 0) {
    return 'messages must be a non-empty array'
  }
  if (value.length > MAX_MESSAGES) {
    return 'Conversation is too long — refresh the page to start a new chat'
  }
  let totalChars = 0
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      return 'Each message must be an object with role and content'
    }
    const { role, content } = entry as { role?: unknown; content?: unknown }
    if (role !== 'user' && role !== 'assistant') {
      return 'Message role must be "user" or "assistant"'
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return 'Message content must be a non-empty string'
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return `Message is too long (max ${MAX_MESSAGE_CHARS.toLocaleString()} characters)`
    }
    totalChars += content.length
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return 'Conversation is too long — refresh the page to start a new chat'
  }
  const messages = value as ChatMessage[]
  if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
    return 'Conversation must start and end with a user message'
  }
  return messages
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
  }

  let body: { messages?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messages = validateMessages(body.messages)
  if (typeof messages === 'string') {
    return Response.json({ error: messages }, { status: 400 })
  }

  // Retrieve the site content for this question and put it in the latest
  // user turn. Earlier turns go through as plain text — their context was
  // only ever in the request that produced them.
  const question = messages[messages.length - 1].content
  const retrieval = await retrieveKnowledge(retrievalQuery(messages))
  const apiMessages: Anthropic.MessageParam[] = messages.map((m, i) =>
    i === messages.length - 1
      ? { role: 'user', content: `${formatSiteContent(retrieval.hits)}\n\nQUESTION: ${question}` }
      : { role: m.role, content: m.content }
  )

  // maxRetries: 2 = up to 3 attempts total. The SDK retries 429 (rate limit),
  // 529 (overloaded), and other 5xx/connection errors automatically with
  // exponential backoff before the stream ever starts.
  const anthropic = new Anthropic({ maxRetries: 2 }) // reads ANTHROPIC_API_KEY
  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    // Persona + fallback handbook are identical on every request, so cache
    // them server-side: first request writes the cache (~1.25x), every
    // request within the TTL reads it at ~0.1x input cost. The retrieved
    // site content varies per question and lives in the messages, after
    // the cached prefix.
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: FALLBACK_CONTEXT, cache_control: { type: 'ephemeral' } },
    ],
    thinking: { type: 'disabled' },
    messages: apiMessages,
  })

  // Pull the first event before building the Response so API-level failures
  // (bad key, rate limit, overload) surface as a real error status instead of
  // a broken 200 stream the client can't distinguish from a normal answer.
  const iterator = stream[Symbol.asyncIterator]()
  let first: Awaited<ReturnType<typeof iterator.next>>
  try {
    first = await iterator.next()
  } catch (err) {
    // The SDK already retried 3x with backoff — this is the "still failing"
    // path. Crews see a friendly line, not the raw API error (that goes to
    // the server log).
    console.error('[hillside-ai] stream start failed after retries:', err)
    // Overload can arrive two ways: an HTTP 429/529 response, or (as seen in
    // practice) a 200 SSE stream whose first event is an overloaded_error —
    // in that case err.status is undefined, so match on the error type too.
    const errType = err instanceof Anthropic.APIError ? err.type : undefined
    if (
      err instanceof Anthropic.APIError &&
      (err.status === 429 || err.status === 529 ||
        errType === 'overloaded_error' || errType === 'rate_limit_error')
    ) {
      return Response.json(
        { error: 'Ricky is swamped right now — give it a few seconds and try again.' },
        { status: 503 }
      )
    }
    return Response.json(
      { error: 'Ricky hit a snag — wait a minute and try again.' },
      { status: 502 }
    )
  }

  // Question log for /admin/ricky: what was asked, what was retrieved, and
  // (once the stream ends) what Ricky said.
  const logQuestion = async (answer: string) => {
    try {
      const { error } = await createAdminClient().from('ricky_questions').insert({
        user_id: user.id,
        question,
        answer: answer || null,
        retrieved: toStoredSources(retrieval.hits),
      })
      if (error) console.error('[hillside-ai] question log failed:', error.message)
    } catch (err) {
      console.error('[hillside-ai] question log failed:', err)
    }
  }

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = ''
      try {
        let result = first
        while (!result.done) {
          const event = result.value
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            answer += event.delta.text
            controller.enqueue(encoder.encode(event.delta.text))
          }
          result = await iterator.next()
        }
        const final = await stream.finalMessage()
        // Cache verification: cache_write > 0 on the first request in a
        // window, cache_read > 0 (and small input) on the ones after it.
        const u = final.usage
        console.log(
          `[hillside-ai] usage: input=${u.input_tokens} cache_write=${u.cache_creation_input_tokens} cache_read=${u.cache_read_input_tokens} output=${u.output_tokens} hits=${retrieval.hits.length} provider=${retrieval.provider ?? 'text-only'}`
        )
        if (final.stop_reason === 'max_tokens') {
          controller.enqueue(encoder.encode('\n\n[Answer cut off — ask a follow-up for the rest.]'))
        }
        await logQuestion(answer)
        controller.close()
      } catch (err) {
        // Status is already sent (200), so the only channel left is the body.
        console.error('[hillside-ai] mid-stream error:', err)
        controller.enqueue(encoder.encode('\n\n[Connection dropped — try again.]'))
        await logQuestion(answer)
        controller.close()
      }
    },
    cancel() {
      // Client navigated away or aborted the fetch — stop paying for tokens.
      stream.abort()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
