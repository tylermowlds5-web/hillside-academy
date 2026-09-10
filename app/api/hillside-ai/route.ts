import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SYSTEM_PROMPT, FALLBACK_CONTEXT } from '@/lib/hillside-ai-prompt'
import { hasOpenExamAttempt } from '@/lib/exam-lock'
import { EXAM_LOCK_MESSAGE } from '@/lib/exam-rules'
import {
  formatSiteContent,
  retrievalQuery,
  retrieveKnowledge,
  toStoredSources,
} from '@/lib/knowledge-retrieval'
import { rickyChatTitle } from '@/lib/ricky-chat'

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
    return 'Conversation is too long — start a new chat'
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
    return 'Conversation is too long — start a new chat'
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

  // Exam lock: no answers anywhere while this employee has a live cert exam
  // attempt. Checked here, server-side, on every request — not just in the
  // exam tab. Quiz answers are in the index, so this is what keeps them out
  // of reach mid-exam.
  if (await hasOpenExamAttempt(user.id)) {
    return Response.json({ error: EXAM_LOCK_MESSAGE, examLocked: true }, { status: 423 })
  }

  let body: { messages?: unknown; chatId?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messages = validateMessages(body.messages)
  if (typeof messages === 'string') {
    return Response.json({ error: messages }, { status: 400 })
  }

  // Chat history (Step 17). chatId = a saved chat being continued (must be
  // this employee's — RLS on the user client hides everyone else's), or
  // null/absent for a new chat, which is created once the answer starts.
  // If the tables aren't there yet the chat still works, just unsaved.
  if (body.chatId != null && typeof body.chatId !== 'string') {
    return Response.json({ error: 'chatId must be a string' }, { status: 400 })
  }
  let chatId: string | null = body.chatId ?? null
  let historyAvailable = true
  if (chatId) {
    const { data: chat, error } = await supabase
      .from('ricky_chats')
      .select('id')
      .eq('id', chatId)
      .maybeSingle<{ id: string }>()
    if (error) {
      console.error('[hillside-ai] chat lookup failed:', error.message)
      historyAvailable = false
      chatId = null
    } else if (!chat) {
      return Response.json({ error: 'That chat is gone — start a new one.' }, { status: 404 })
    }
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

  // Save the employee's turn now that the answer has started (so a failed
  // start leaves nothing behind). New chat → create the row, titled from
  // this first question, and hand the id back in a header.
  const admin = createAdminClient()
  if (historyAvailable) {
    try {
      if (!chatId) {
        const { data, error } = await admin
          .from('ricky_chats')
          .insert({ user_id: user.id, title: rickyChatTitle(question) })
          .select('id')
          .single<{ id: string }>()
        if (error) throw error
        chatId = data.id
      }
      const { error } = await admin
        .from('ricky_messages')
        .insert({ chat_id: chatId, role: 'user', content: question })
      if (error) throw error
    } catch (err) {
      console.error('[hillside-ai] saving user turn failed:', err instanceof Error ? err.message : JSON.stringify(err))
      historyAvailable = false
      chatId = null
    }
  }

  // Ricky's turn, once the stream ends: the answer with what was retrieved
  // for it, and the chat bumped to the top of the history list.
  const saveAnswer = async (answer: string) => {
    if (!historyAvailable || !chatId || !answer) return
    try {
      const { error } = await admin.from('ricky_messages').insert({
        chat_id: chatId,
        role: 'assistant',
        content: answer,
        sources: toStoredSources(retrieval.hits),
      })
      if (error) throw error
      const { error: bumpErr } = await admin
        .from('ricky_chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId)
      if (bumpErr) throw bumpErr
    } catch (err) {
      console.error('[hillside-ai] saving answer failed:', err instanceof Error ? err.message : JSON.stringify(err))
    }
  }

  // Question log for /admin/ricky: what was asked, what was retrieved, and
  // (once the stream ends) what Ricky said. Unchanged by chat history.
  const logQuestion = async (answer: string) => {
    try {
      const { error } = await admin.from('ricky_questions').insert({
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
          answer += '\n\n[Answer cut off — ask a follow-up for the rest.]'
          controller.enqueue(encoder.encode('\n\n[Answer cut off — ask a follow-up for the rest.]'))
        }
        await Promise.all([saveAnswer(answer), logQuestion(answer)])
        controller.close()
      } catch (err) {
        // Status is already sent (200), so the only channel left is the body.
        console.error('[hillside-ai] mid-stream error:', err)
        controller.enqueue(encoder.encode('\n\n[Connection dropped — try again.]'))
        await Promise.all([saveAnswer(answer), logQuestion(answer)])
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
      // The saved chat this answer belongs to (absent when history is
      // unavailable). The client swaps it into the URL for a new chat.
      ...(chatId ? { 'X-Chat-Id': chatId } : {}),
    },
  })
}
