'use client'

import { useEffect, useRef, useState } from 'react'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function HillsideAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Keep the newest message in view as chunks stream in.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Abort an in-flight stream if the user navigates away mid-answer.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function sendMessage() {
    const text = input.trim()
    if (!text || streaming) return

    setError(null)
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/hillside-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Request failed (${res.status})`)
      }
      if (!res.body) throw new Error('No response stream')

      // Empty assistant bubble first (renders the typing dots), then fill it
      // as chunks arrive.
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (!chunk) continue
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, content: last.content + chunk }
          return next
        })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      // Drop a still-empty assistant bubble (stream died before any text) so
      // the next request doesn't send an empty message the API rejects.
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && last.content === '') return prev.slice(0, -1)
        return prev
      })
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter makes a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen max-w-3xl mx-auto w-full p-4 sm:p-6 gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9.375 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.625 12l2.846-.813a4.5 4.5 0 003.09-3.09L9.375 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </span>
        <div>
          <h1 className="text-xl font-bold text-zinc-50">Gus</h1>
          <p className="text-sm text-zinc-400">Your crew AI — ask about jobs, routes, and plants</p>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 min-h-0 bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-zinc-500 text-sm text-center max-w-xs">
              Ask Gus about a job, a route, or a plant — like &ldquo;How do we trim boxwoods?&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, i) =>
              message.role === 'user' ? (
                <div
                  key={i}
                  className="max-w-[85%] ml-auto w-fit bg-emerald-500/15 border border-emerald-500/30 text-zinc-100 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm whitespace-pre-wrap"
                >
                  {message.content}
                </div>
              ) : (
                <div key={i} className="flex items-end gap-2 max-w-[85%]">
                  <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-plum-dark text-[10px] font-bold">
                    G
                  </span>
                  <div className="bg-plum-light border border-plum text-tan rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
                    {message.content === '' ? (
                      <span className="flex gap-1 py-1" aria-label="Gus is typing">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse [animation-delay:300ms]" />
                      </span>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-burgundy/15 border border-burgundy/50 text-red-400 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          sendMessage()
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask Gus…"
          disabled={streaming}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || input.trim().length === 0}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-plum-dark font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
