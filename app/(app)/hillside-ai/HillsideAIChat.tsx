'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EXAM_LOCK_MESSAGE } from '@/lib/exam-rules'
import { rickyChatTitle } from '@/lib/ricky-chat'
import type { RickyChatSummary } from '@/lib/types'
import { deleteRickyChat } from './actions'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

// Only the most recent turns go to the model — older ones fall off the
// context, the saved chat itself keeps everything.
const CONTEXT_TURNS = 30
// How close to the bottom (px) still counts as "at the bottom" for the
// follow-along scroll.
const BOTTOM_SLACK = 48

function contextWindow(all: ChatMessage[]): ChatMessage[] {
  const recent = all.slice(-CONTEXT_TURNS)
  // The route requires the conversation to open with a user turn.
  while (recent.length && recent[0].role !== 'user') recent.shift()
  return recent
}

// Ricky cites sources as "From: [Title (Kind)](/path)" lines. Render those
// markdown links as in-app links; everything else stays plain text. Only
// same-site paths become links — anything else is left as written.
const LINK_RE = /\[([^\]\n]+)\]\((\/[^)\s]*)\)/g

function AssistantText({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <>
      {lines.map((line, li) => {
        const isSource = /^\s*From:/.test(line)
        const parts: React.ReactNode[] = []
        let last = 0
        for (const m of line.matchAll(LINK_RE)) {
          const start = m.index ?? 0
          if (start > last) parts.push(line.slice(last, start))
          parts.push(
            <Link
              key={`${li}-${start}`}
              href={m[2]}
              className="text-emerald-400 underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-300"
            >
              {m[1]}
            </Link>
          )
          last = start + m[0].length
        }
        if (last < line.length) parts.push(line.slice(last))
        return (
          <span key={li} className={isSource ? 'block text-xs text-tan/70 first:mt-0 mt-1' : undefined}>
            {parts}
            {!isSource && li < lines.length - 1 ? '\n' : null}
          </span>
        )
      })}
    </>
  )
}

// "Today", "Yesterday", or a short date — enough to scan a history list.
function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

function RickyIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9.375 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.625 12l2.846-.813a4.5 4.5 0 003.09-3.09L9.375 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

// History list: newest first, the open chat highlighted, a per-chat delete
// that asks inline (no browser confirm). Rendered in the desktop rail and
// in the mobile drawer.
function HistoryPanel({
  chats,
  activeId,
  busy,
  onDelete,
  onNavigate,
}: {
  chats: RickyChatSummary[]
  activeId: string | null
  busy: boolean
  onDelete: (id: string) => Promise<void>
  onNavigate?: () => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Link
          href="/hillside-ai"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New chat
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {chats.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-zinc-500">
            Your past chats with Ricky will show up here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((c) => {
              const active = c.id === activeId
              const confirming = confirmId === c.id
              return (
                <li key={c.id} className="group relative">
                  {confirming ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs">
                      <span className="text-zinc-300">Delete this chat?</span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          disabled={deletingId === c.id}
                          onClick={async () => {
                            setDeletingId(c.id)
                            try {
                              await onDelete(c.id)
                            } finally {
                              setDeletingId(null)
                              setConfirmId(null)
                            }
                          }}
                          className="rounded-md bg-red-500/20 px-2 py-1 font-semibold text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                        >
                          {deletingId === c.id ? '…' : 'Delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded-md px-2 py-1 font-semibold text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        >
                          Keep
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/hillside-ai?chat=${c.id}`}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={`block rounded-lg py-2 pl-3 pr-9 transition-colors ${
                          active ? 'bg-emerald-500/15 text-emerald-200' : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50'
                        }`}
                      >
                        <span className="block truncate text-sm">{c.title}</span>
                        <span className={`block text-[11px] ${active ? 'text-emerald-300/70' : 'text-zinc-500'}`}>
                          {fmtWhen(c.updated_at)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete chat "${c.title}"`}
                        title="Delete chat"
                        disabled={busy}
                        onClick={() => setConfirmId(c.id)}
                        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 transition-opacity hover:bg-zinc-700 hover:text-red-300 disabled:opacity-30 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 ${
                          active ? 'md:opacity-100' : ''
                        }`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function HillsideAIChat({
  initialExamLocked = false,
  chatId: initialChatId,
  initialMessages,
  chats: initialChats,
}: {
  initialExamLocked?: boolean
  // Saved chat being continued, or null for a brand-new one (the route
  // creates the row on the first send and hands the id back).
  chatId: string | null
  initialMessages: ChatMessage[]
  chats: RickyChatSummary[]
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Exam lock: the route answers 423 while the employee has a cert exam
  // open. Shown as a banner with the input disabled; "Check again" simply
  // lets them try (the route re-checks every request).
  const [examLocked, setExamLocked] = useState(initialExamLocked)
  const [chatId, setChatId] = useState<string | null>(initialChatId)
  const [chats, setChats] = useState<RickyChatSummary[]>(initialChats)
  const [historyOpen, setHistoryOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // ── Follow-along scroll ─────────────────────────────────────────────────
  // While the reader is at the bottom, new chunks keep the list pinned
  // there. The moment they scroll up we stop following and instead show a
  // "↓ New" button; scrolling back down (or pressing it) resumes following.
  const listRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)
  const [pinned, setPinned] = useState(true)
  const [hasNew, setHasNew] = useState(false)

  const scrollToBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK
    pinnedRef.current = atBottom
    setPinned(atBottom)
    if (atBottom) setHasNew(false)
  }

  // Runs after every message change (each streamed chunk included): only
  // moves the scroll position when the reader is pinned to the bottom.
  useLayoutEffect(() => {
    if (pinnedRef.current) scrollToBottom()
  }, [messages])

  // Abort an in-flight stream if the user navigates away mid-answer.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  function jumpToNew() {
    pinnedRef.current = true
    setPinned(true)
    setHasNew(false)
    scrollToBottom()
  }

  // Keep the sidebar honest without a server round-trip: a new chat goes to
  // the top with its title; a continued one moves to the top.
  function touchChat(id: string, title?: string) {
    const now = new Date().toISOString()
    setChats((prev) => {
      const existing = prev.find((c) => c.id === id)
      const rest = prev.filter((c) => c.id !== id)
      return [{ id, title: title ?? existing?.title ?? 'New chat', updated_at: now }, ...rest]
    })
  }

  async function handleDelete(id: string) {
    const res = await deleteRickyChat(id)
    if (res.error) {
      setError(`Couldn't delete that chat: ${res.error}`)
      return
    }
    setChats((prev) => prev.filter((c) => c.id !== id))
    if (id === chatId) {
      abortRef.current?.abort()
      router.push('/hillside-ai')
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || streaming) return

    setError(null)
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setStreaming(true)
    // Sending always brings the reader back to the bottom.
    pinnedRef.current = true
    setPinned(true)
    setHasNew(false)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/hillside-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messages: contextWindow(nextMessages) }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        if (res.status === 423) {
          // Put the question back in the box so nothing is lost.
          setMessages(messages)
          setInput(text)
          setExamLocked(true)
          return
        }
        throw new Error(body?.error ?? `Request failed (${res.status})`)
      }
      if (!res.body) throw new Error('No response stream')

      // A brand-new chat gets its id from the route once the answer has
      // started. Swap the URL in place (no navigation, so nothing remounts
      // mid-stream) so a refresh or back-button lands on this chat.
      const savedId = res.headers.get('X-Chat-Id')
      if (savedId) {
        if (!chatId) {
          setChatId(savedId)
          window.history.replaceState(null, '', `/hillside-ai?chat=${savedId}`)
          touchChat(savedId, rickyChatTitle(text))
        } else {
          touchChat(savedId)
        }
      }

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
        // Reader has scrolled up: flag that there's more below.
        if (!pinnedRef.current) setHasNew(true)
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
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen w-full">
      {/* History rail (desktop) */}
      <aside className="hidden md:flex w-64 flex-none flex-col border-r border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <RickyIcon className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Chat history</p>
        </div>
        <HistoryPanel chats={chats} activeId={chatId} busy={streaming} onDelete={handleDelete} />
      </aside>

      {/* History drawer (mobile) */}
      {historyOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
              <p className="pl-2 text-sm font-semibold text-zinc-50">Chat history</p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800"
                aria-label="Close history"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <HistoryPanel
                chats={chats}
                activeId={chatId}
                busy={streaming}
                onDelete={handleDelete}
                onNavigate={() => setHistoryOpen(false)}
              />
            </div>
          </aside>
        </>
      )}

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="md:hidden flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            aria-label="Open chat history"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <RickyIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-zinc-50">Ricky Bobby</h1>
            <p className="truncate text-sm text-zinc-400">Your crew AI — answers from Hillside University, with links to the source</p>
          </div>
        </div>

        {/* Message list */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="h-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 overflow-y-auto"
          >
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-zinc-500 text-sm text-center max-w-xs">
                  Ask Ricky Bobby about a job, a route, or a plant — like &ldquo;How do we trim boxwoods?&rdquo;
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
                        R
                      </span>
                      <div className="bg-plum-light border border-plum text-tan rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
                        {message.content === '' ? (
                          <span className="flex gap-1 py-1" aria-label="Ricky is typing">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse [animation-delay:300ms]" />
                          </span>
                        ) : (
                          <AssistantText content={message.content} />
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Reader scrolled up while Ricky kept talking */}
          {!pinned && hasNew && (
            <button
              type="button"
              onClick={jumpToNew}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-zinc-900/95 px-3 py-1.5 text-xs font-semibold text-emerald-300 shadow-lg backdrop-blur transition-colors hover:bg-emerald-500/15"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
              </svg>
              New
            </button>
          )}
        </div>

        {/* Exam lock banner */}
        {examLocked && (
          <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm rounded-lg px-3 py-2">
            <span>{EXAM_LOCK_MESSAGE}</span>
            <button
              type="button"
              onClick={() => setExamLocked(false)}
              className="flex-none rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-semibold hover:bg-amber-500/15 transition-colors"
            >
              Check again
            </button>
          </div>
        )}

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
            placeholder={examLocked ? 'Ricky is off during your exam' : 'Ask Ricky…'}
            disabled={streaming || examLocked}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || examLocked || input.trim().length === 0}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-plum-dark font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
