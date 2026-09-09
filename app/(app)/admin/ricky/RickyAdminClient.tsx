'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtDateTime } from '@/lib/format-date'
import { rebuildKnowledgeIndexAction, type RebuildResult } from '@/app/knowledge-actions'
import type { RickyRetrievedSource } from '@/lib/types'

export type QuestionRow = {
  id: string
  askedBy: string
  question: string
  answer: string | null
  retrieved: RickyRetrievedSource[]
  createdAt: string
}

export type IndexStats = {
  total: number
  withEmbedding: number
  byKind: Record<string, number>
  latestUpdate: string | null
  provider: string | null
}

const VIA_LABEL: Record<RickyRetrievedSource['via'], string> = {
  plant: 'plant name',
  vector: 'vector',
  text: 'full-text',
}

export default function RickyAdminClient({
  questions,
  stats,
  setupError,
}: {
  questions: QuestionRow[]
  stats: IndexStats
  setupError: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<RebuildResult | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  function rebuild() {
    setResult(null)
    startTransition(async () => {
      const res = await rebuildKnowledgeIndexAction()
      setResult(res)
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="p-4 sm:p-6 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Ricky Bobby</h1>
          <p className="text-zinc-400 text-sm mt-1">
            What crews are asking, what Ricky pulled from the site to answer, and the knowledge index behind it
          </p>
        </div>
        <button
          type="button"
          onClick={rebuild}
          disabled={pending || !!setupError}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-plum-dark text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {pending ? 'Rebuilding…' : 'Rebuild index'}
        </button>
      </div>

      {setupError && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          The knowledge index tables aren&apos;t set up yet — run <code className="font-mono">RUN-THIS.sql</code> in the
          Supabase SQL editor, then come back and press Rebuild index.
          <span className="block mt-1 text-xs text-amber-200/70 font-mono">{setupError}</span>
        </div>
      )}

      {result && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            result.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-burgundy/50 bg-burgundy/15 text-red-300'
          }`}
        >
          {result.ok ? (
            <>
              Rebuilt {result.summary.total} entries in {(result.summary.durationMs / 1000).toFixed(1)}s —{' '}
              {result.summary.embedded} re-embedded, {result.summary.removed} removed
              {result.summary.provider ? ` (embeddings: ${result.summary.provider})` : ' (no embedding key — full-text only)'}.
              {result.summary.embeddingError && (
                <span className="block mt-1 text-amber-200">
                  Embedding failed, rows were saved without vectors: {result.summary.embeddingError}
                </span>
              )}
            </>
          ) : (
            <>Rebuild failed: {result.error}</>
          )}
        </div>
      )}

      {/* Index stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Stat label="Indexed entries" value={String(stats.total)} />
          <Stat
            label="With embeddings"
            value={`${stats.withEmbedding} / ${stats.total}`}
            hint={stats.provider ?? 'No VOYAGE_API_KEY / OPENAI_API_KEY set — Ricky uses full-text search only'}
            warn={!stats.provider}
          />
          <Stat label="Last indexed" value={stats.latestUpdate ? fmtDateTime(stats.latestUpdate) : '—'} hint="Nightly rebuild at 2 AM Pacific; every admin save re-indexes its row" />
        </div>
        {Object.keys(stats.byKind).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(stats.byKind)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, n]) => (
                <span key={kind} className="rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-300">
                  {kind} <span className="text-zinc-500">{n}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Questions */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
        Last {questions.length} questions
      </h2>
      {questions.length === 0 ? (
        <p className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
          Nothing asked yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => {
            const open = openId === q.id
            return (
              <li key={q.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : q.id)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words">{q.question}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {q.askedBy} · {fmtDateTime(q.createdAt)} · {q.retrieved.length} source{q.retrieved.length === 1 ? '' : 's'} retrieved
                      {q.answer === null && <span className="text-amber-400"> · no answer recorded</span>}
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 mt-1 flex-none text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {open && (
                  <div className="border-t border-zinc-800 px-4 py-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Retrieved</h3>
                      {q.retrieved.length === 0 ? (
                        <p className="text-sm text-zinc-500">Nothing matched in the index.</p>
                      ) : (
                        <ol className="space-y-1.5">
                          {q.retrieved.map((s, i) => (
                            <li key={`${s.source_table}-${s.source_id}-${i}`} className="text-sm">
                              <Link href={s.url} className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                                {s.title}
                              </Link>
                              <span className="text-zinc-500"> ({s.kind})</span>
                              <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                                {VIA_LABEL[s.via] ?? s.via}
                                {typeof s.score === 'number' && s.via !== 'plant' ? ` ${s.score}` : ''}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Ricky said</h3>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
                        {q.answer ?? <span className="text-zinc-500">(stream ended before an answer was recorded)</span>}
                      </p>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-100">{value}</p>
      {hint && <p className={`text-xs mt-0.5 ${warn ? 'text-amber-400' : 'text-zinc-500'}`}>{hint}</p>}
    </div>
  )
}
