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

// User-requested model. Claude Sonnet 4.5 — a single generation call needs no
// extended thinking or prompt caching (the transcript differs every time).
const CLAUDE_MODEL = 'claude-sonnet-4-5'

const SYSTEM_PROMPT = `You write the instructional content for a lawn care and landscaping training platform used by field employees. You are given the transcript of a training video. Write a short, self-contained training guide that teaches the skill demonstrated — NOT a summary of the video.

Requirements:
- Write in the second person ("you should", "start by", "always make sure").
- Teach the actual techniques, steps, and key information from the video.
- Aim for 200-300 words. Include enough detail to genuinely teach the skill, but don't pad — concise enough to read quickly.
- Use bullet points and numbered steps for lists.
- For section headings, use bold text on its own line (e.g. **Steps** or **Tips**). NEVER use markdown headers like #, ##, or ### — the output is shown in a web app where those render wrong.
- Formatting allowed: bold with **double asterisks**, bullet points, numbered steps, and line breaks. Nothing else.

Do NOT summarize what the video covers and do NOT refer to "the video" or "the instructor" — write the instructional content directly. Output only the guide, with no preamble or title.`

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
        // Current API requires `speech_models` (array, priority order). The docs
        // recommend ["universal-3-pro", "universal-2"] — newest model first, with
        // universal-2 as the broad-language fallback. (`speech_model`/"universal"
        // are legacy and get rejected.)
        body: JSON.stringify({
          audio_url: body.videoUrl,
          speech_models: ['universal-3-pro', 'universal-2'],
        }),
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
        max_tokens: 1024, // room for a 150-300 word formatted guide
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Here is the transcript of the training video. Write the training guide:\n\n${transcript}`,
          },
        ],
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
