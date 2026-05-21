'use client'

import { useState } from 'react'

export type GenState = 'idle' | 'transcribing' | 'generating' | 'error'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Calls /api/generate-description, which splits the work into short calls the
// client polls between so nothing exceeds the serverless function timeout.
async function generateDescriptionApi<T>(body: object): Promise<T> {
  const res = await fetch('/api/generate-description', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `Description request failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {}
    throw new Error(message)
  }
  return res.json()
}

/**
 * Shared AI-description flow used by both the upload (VideoForm) and edit
 * (EditVideoPanel) forms. Transcribes the given (already-uploaded) R2 video URL
 * via AssemblyAI, then summarizes it with Claude, calling `onResult` with the
 * generated text. The caller decides where the URL comes from.
 */
export function useGenerateDescription(onResult: (text: string) => void) {
  const [genState, setGenState] = useState<GenState>('idle')
  const [genError, setGenError] = useState<string | null>(null)
  const busy = genState === 'transcribing' || genState === 'generating'

  async function generate(videoUrl: string) {
    if (!videoUrl || busy) return
    setGenError(null)
    setGenState('transcribing')
    try {
      const { transcriptId } = await generateDescriptionApi<{ transcriptId: string }>({ videoUrl })

      // Poll until AssemblyAI finishes (or fails).
      for (;;) {
        const { status: tStatus, error: tError } = await generateDescriptionApi<{
          status: string
          error: string | null
        }>({ transcriptId })
        if (tStatus === 'completed') break
        if (tStatus === 'error') throw new Error(tError || 'Transcription failed')
        await sleep(3000)
      }

      setGenState('generating')
      const { description } = await generateDescriptionApi<{ description: string }>({
        transcriptId,
        summarize: true,
      })
      onResult(description)
      setGenState('idle')
    } catch (err) {
      setGenState('error')
      setGenError(err instanceof Error ? err.message : 'Failed to generate description')
    }
  }

  return { genState, genError, busy, generate }
}
