import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// AssemblyAI transcribes the video's audio; Claude turns the transcript into a
// short description. The work is split across calls the client polls between,
// so no single request runs long enough to hit the Vercel function timeout:
//   1. { videoUrl }                 → starts transcription, returns transcriptId
//   2. { transcriptId }             → polls status: queued | processing | completed | error
//   3. { transcriptId, summarize }  → fetches the transcript and summarizes it with Claude

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2'

// User-requested model. Claude Sonnet 4 — a single, short summarization needs no
// extended thinking or prompt caching (the transcript differs every time).
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_PROMPT =
  'You write short descriptions for training videos on a lawn care and landscaping ' +
  'training platform used by field employees. Given a transcript, write a concise ' +
  '2-3 sentence description of what the video covers and what the viewer will learn. ' +
  'Use plain, direct language. Output only the description — no preamble, no quotes, ' +
  'no markdown.'

function assemblyHeaders(): HeadersInit {
  return { authorization: process.env.ASSEMBLYAI_API_KEY!, 'content-type': 'application/json' }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.ASSEMBLYAI_API_KEY) {
    return Response.json({ error: 'ASSEMBLYAI_API_KEY is not configured' }, { status: 500 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
  }

  let body: { videoUrl?: string; transcriptId?: string; summarize?: boolean }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    // ── 1. Start transcription ──────────────────────────────────────────
    if (body.videoUrl) {
      console.log('[generate-description] submitting to AssemblyAI — audio_url:', body.videoUrl)
      const res = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
        method: 'POST',
        headers: assemblyHeaders(),
        body: JSON.stringify({ audio_url: body.videoUrl, speech_model: 'universal' }),
      })
      if (!res.ok) {
        const detail = await res.text()
        console.error(
          `[generate-description] AssemblyAI submit failed (status ${res.status}) for audio_url ${body.videoUrl}\nResponse body: ${detail}`
        )
        // Surface AssemblyAI's exact rejection (and the URL we sent) to the client.
        return Response.json(
          {
            error: `AssemblyAI rejected the request (${res.status}): ${detail || '(empty response body)'}`,
            assemblyAiStatus: res.status,
            assemblyAiBody: detail,
            audioUrl: body.videoUrl,
          },
          { status: 502 }
        )
      }
      const data = (await res.json()) as { id: string }
      return Response.json({ transcriptId: data.id })
    }

    const transcriptId = body.transcriptId?.trim()
    if (!transcriptId) {
      return Response.json({ error: 'videoUrl or transcriptId is required' }, { status: 400 })
    }

    // ── 3. Summarize the completed transcript with Claude ───────────────
    if (body.summarize) {
      const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
        headers: assemblyHeaders(),
      })
      if (!res.ok) {
        return Response.json({ error: `Failed to fetch transcript (${res.status})` }, { status: 502 })
      }
      const data = (await res.json()) as { status: string; text?: string }
      if (data.status !== 'completed') {
        return Response.json({ error: `Transcript is not ready (status: ${data.status})` }, { status: 409 })
      }
      const transcript = (data.text ?? '').trim()
      if (!transcript) {
        return Response.json({ error: 'Transcript was empty — no speech detected in the video' }, { status: 422 })
      }

      const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY
      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Video transcript:\n\n${transcript}` }],
      })
      const description = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim()

      if (!description) {
        return Response.json({ error: 'Claude returned an empty description' }, { status: 502 })
      }
      return Response.json({ description })
    }

    // ── 2. Poll transcription status ────────────────────────────────────
    const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
      headers: assemblyHeaders(),
    })
    if (!res.ok) {
      return Response.json({ error: `Failed to check status (${res.status})` }, { status: 502 })
    }
    const data = (await res.json()) as { status: string; error?: string }
    return Response.json({ status: data.status, error: data.error ?? null })
  } catch (err) {
    console.error('[generate-description] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Description generation failed: ${message}` }, { status: 500 })
  }
}
