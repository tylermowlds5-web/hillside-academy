'use client'

import { useEffect, useMemo, useState } from 'react'
import { fmtDate } from '@/lib/format-date'

export type InsightQuiz = {
  id: string
  title: string
  kind: 'video' | 'standalone'
}

export type InsightAttempt = {
  quizId: string
  userId: string
  userName: string
  takenAt: string // ISO timestamp
  answers: { question_text: string; is_correct: boolean; chosen: string; correct: string }[]
}

// One employee's response to a question, from their first attempt in range.
type ResponseDetail = {
  userName: string
  isCorrect: boolean
  chosen: string
  takenAt: string
}

type ReportRow = {
  quizId: string
  quizTitle: string
  kind: 'video' | 'standalone'
  questionText: string
  correctAnswer: string
  correct: number
  incorrect: number
  total: number
  pctIncorrect: number // 0-100, rounded
  responses: ResponseDetail[]
}

// Composite-key separator for the aggregation maps. Quiz ids are UUIDs (hex +
// hyphens), so a colon can never appear in the first key segment — the first
// ':' always delimits the quiz id cleanly, even when the trailing segment
// (a question's text) contains colons of its own.
const SEP = ':'

function escapeCSV(val: string | number): string {
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export default function InsightsClient({
  quizzes,
  attempts,
}: {
  quizzes: InsightQuiz[]
  attempts: InsightAttempt[]
}) {
  const [startDate, setStartDate] = useState('') // YYYY-MM-DD, '' = unbounded
  const [endDate, setEndDate] = useState('')
  // Default: every quiz selected.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(quizzes.map((q) => q.id))
  )
  // Key of the question whose drill-down modal is open (null = closed). We key
  // by quiz+question and resolve the live row below, so the modal stays in sync
  // with the active filters (and closes automatically if the question drops out
  // of range).
  const [detailKey, setDetailKey] = useState<string | null>(null)

  const quizById = useMemo(() => {
    const m = new Map<string, InsightQuiz>()
    for (const q of quizzes) m.set(q.id, q)
    return m
  }, [quizzes])

  const rows = useMemo<ReportRow[]>(() => {
    // 1. Keep only attempts for selected quizzes that fall within the date
    //    range (inclusive). Dates compare on the YYYY-MM-DD prefix; ISO strings
    //    sort lexicographically in chronological order.
    const inScope = attempts.filter((a) => {
      if (!selectedIds.has(a.quizId)) return false
      const day = a.takenAt.slice(0, 10)
      if (startDate && day < startDate) return false
      if (endDate && day > endDate) return false
      return true
    })

    // 2. For each (quiz, employee) keep only their EARLIEST attempt in range —
    //    each person contributes at most one data point per question.
    const firstAttempt = new Map<string, InsightAttempt>()
    for (const a of inScope) {
      const key = `${a.quizId}${SEP}${a.userId}`
      const existing = firstAttempt.get(key)
      if (!existing || a.takenAt < existing.takenAt) firstAttempt.set(key, a)
    }

    // 3. Tally correct/incorrect per (quiz, question), and keep each employee's
    //    individual response for the drill-down. correctAnswer is captured from
    //    the first response that carries one (it's identical across attempts).
    type Agg = {
      quizId: string
      questionText: string
      correctAnswer: string
      correct: number
      incorrect: number
      responses: ResponseDetail[]
    }
    const agg = new Map<string, Agg>()
    for (const a of firstAttempt.values()) {
      for (const ans of a.answers) {
        const key = `${a.quizId}${SEP}${ans.question_text}`
        let entry = agg.get(key)
        if (!entry) {
          entry = { quizId: a.quizId, questionText: ans.question_text, correctAnswer: '', correct: 0, incorrect: 0, responses: [] }
          agg.set(key, entry)
        }
        if (!entry.correctAnswer && ans.correct) entry.correctAnswer = ans.correct
        if (ans.is_correct) entry.correct++
        else entry.incorrect++
        entry.responses.push({
          userName: a.userName,
          isCorrect: ans.is_correct,
          chosen: ans.chosen,
          takenAt: a.takenAt,
        })
      }
    }

    // 4. Shape into rows, compute % incorrect, sort most-failed first.
    const out: ReportRow[] = []
    for (const e of agg.values()) {
      const quiz = quizById.get(e.quizId)
      const total = e.correct + e.incorrect
      // Within a question, surface the people who got it wrong first, then by
      // most-recent attempt so the newest activity is on top.
      e.responses.sort(
        (a, b) =>
          Number(a.isCorrect) - Number(b.isCorrect) ||
          b.takenAt.localeCompare(a.takenAt) ||
          a.userName.localeCompare(b.userName)
      )
      out.push({
        quizId: e.quizId,
        quizTitle: quiz?.title ?? 'Unknown quiz',
        kind: quiz?.kind ?? 'standalone',
        questionText: e.questionText,
        correctAnswer: e.correctAnswer,
        correct: e.correct,
        incorrect: e.incorrect,
        total,
        pctIncorrect: total > 0 ? Math.round((e.incorrect / total) * 100) : 0,
        responses: e.responses,
      })
    }
    out.sort(
      (a, b) =>
        b.pctIncorrect - a.pctIncorrect ||
        b.total - a.total ||
        a.quizTitle.localeCompare(b.quizTitle)
    )
    return out
  }, [attempts, selectedIds, startDate, endDate, quizById])

  // Resolve the open drill-down from the live rows so it tracks the filters.
  const detail = useMemo(
    () => (detailKey ? rows.find((r) => `${r.quizId}${SEP}${r.questionText}` === detailKey) ?? null : null),
    [detailKey, rows]
  )

  // Close the drill-down on Escape.
  useEffect(() => {
    if (!detailKey) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetailKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailKey])

  function toggleQuiz(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = selectedIds.size === quizzes.length
  function selectAll() {
    setSelectedIds(new Set(quizzes.map((q) => q.id)))
  }
  function clearAll() {
    setSelectedIds(new Set())
  }

  function exportCSV() {
    const header = ['Quiz Title', 'Question', 'Correct Count', 'Incorrect Count', 'Total Responses', 'Percent Incorrect']
    const lines = [header.map(escapeCSV).join(',')]
    for (const r of rows) {
      lines.push(
        [r.quizTitle, r.questionText, r.correct, r.incorrect, r.total, `${r.pctIncorrect}%`]
          .map(escapeCSV)
          .join(',')
      )
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `question-analytics-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 sm:p-6 w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Quiz Insights</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Which questions get missed most — based on each employee&apos;s first attempt in range
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export to CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 mb-6 space-y-5">
        {/* Date range */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">End date</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('')
                setEndDate('')
              }}
              className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Clear dates
            </button>
          )}
        </div>

        {/* Quiz multi-select */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-zinc-400">
              Quizzes ({selectedIds.size}/{quizzes.length} selected)
            </label>
            <div className="flex gap-3 text-xs">
              <button
                onClick={selectAll}
                disabled={allSelected}
                className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Select all
              </button>
              <button
                onClick={clearAll}
                disabled={selectedIds.size === 0}
                className="text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear all
              </button>
            </div>
          </div>
          {quizzes.length === 0 ? (
            <p className="text-sm text-zinc-500">No quizzes found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
              {quizzes.map((q) => (
                <label
                  key={q.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(q.id)}
                    onChange={() => toggleQuiz(q.id)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50 flex-shrink-0"
                  />
                  <span className="text-sm text-zinc-200 truncate flex-1">{q.title}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${
                      q.kind === 'video'
                        ? 'bg-sky-500/15 text-sky-400'
                        : 'bg-violet-500/15 text-violet-400'
                    }`}
                  >
                    {q.kind === 'video' ? 'Video' : 'Standalone'}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm font-medium text-zinc-200">
            {rows.length} question{rows.length === 1 ? '' : 's'} with responses
          </p>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />&gt;50% wrong</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />25–50%</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />&lt;25%</span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-16 text-center text-zinc-500 text-sm">
            No responses match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="font-medium px-4 sm:px-5 py-2.5">Quiz</th>
                  <th className="font-medium px-4 py-2.5">Question</th>
                  <th className="font-medium px-4 py-2.5 text-center whitespace-nowrap">Correct</th>
                  <th className="font-medium px-4 py-2.5 text-center whitespace-nowrap">Incorrect</th>
                  <th className="font-medium px-4 py-2.5 text-center whitespace-nowrap">Total</th>
                  <th className="font-medium px-4 sm:px-5 py-2.5 text-right whitespace-nowrap">% Incorrect</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const color =
                    r.pctIncorrect > 50
                      ? 'text-red-400'
                      : r.pctIncorrect >= 25
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  const bar =
                    r.pctIncorrect > 50
                      ? 'bg-red-500'
                      : r.pctIncorrect >= 25
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  const key = `${r.quizId}${SEP}${r.questionText}`
                  return (
                    <tr
                      key={`${key}${i}`}
                      onClick={() => setDetailKey(key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetailKey(key)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View who answered: ${r.questionText}`}
                      className="border-b border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-800/40 focus:bg-zinc-800/40 focus:outline-none"
                    >
                      <td className="px-4 sm:px-5 py-3 align-top">
                        <div className="text-zinc-300 max-w-[14rem]">{r.quizTitle}</div>
                        <span
                          className={`mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            r.kind === 'video' ? 'bg-sky-500/15 text-sky-400' : 'bg-violet-500/15 text-violet-400'
                          }`}
                        >
                          {r.kind === 'video' ? 'Video' : 'Standalone'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-zinc-200 max-w-md">{r.questionText}</td>
                      <td className="px-4 py-3 align-top text-center text-zinc-400">{r.correct}</td>
                      <td className="px-4 py-3 align-top text-center text-zinc-400">{r.incorrect}</td>
                      <td className="px-4 py-3 align-top text-center text-zinc-400">{r.total}</td>
                      <td className="px-4 sm:px-5 py-3 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden sm:block w-20 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div className={`h-full ${bar}`} style={{ width: `${r.pctIncorrect}%` }} />
                          </div>
                          <span className={`font-semibold tabular-nums ${color}`}>{r.pctIncorrect}%</span>
                          <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-question drill-down */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setDetailKey(null)}
        >
          <div
            className="w-full max-w-2xl my-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-zinc-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-zinc-400 truncate">{detail.quizTitle}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${
                      detail.kind === 'video' ? 'bg-sky-500/15 text-sky-400' : 'bg-violet-500/15 text-violet-400'
                    }`}
                  >
                    {detail.kind === 'video' ? 'Video' : 'Standalone'}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-zinc-50 leading-snug">{detail.questionText}</h2>
              </div>
              <button
                onClick={() => setDetailKey(null)}
                className="p-1.5 -mr-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 flex-shrink-0"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Correct answer + summary */}
            <div className="px-5 py-4 border-b border-zinc-800 space-y-2">
              {detail.correctAnswer ? (
                <div className="text-sm">
                  <span className="text-zinc-500">Correct answer: </span>
                  <span className="text-emerald-400 font-medium">{detail.correctAnswer}</span>
                </div>
              ) : (
                <div className="text-sm text-zinc-500">Correct answer not recorded for this question.</div>
              )}
              <div className="text-xs text-zinc-400">
                {detail.incorrect} incorrect · {detail.correct} correct · {detail.total} total ·{' '}
                <span
                  className={
                    detail.pctIncorrect > 50
                      ? 'text-red-400'
                      : detail.pctIncorrect >= 25
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }
                >
                  {detail.pctIncorrect}% incorrect
                </span>
              </div>
            </div>

            {/* Per-person responses (incorrect first) */}
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                    <th className="font-medium px-5 py-2.5">Employee</th>
                    <th className="font-medium px-4 py-2.5">Their answer</th>
                    <th className="font-medium px-5 py-2.5 text-right whitespace-nowrap">Attempt date</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.responses.map((resp, i) => (
                    <tr key={`${resp.userName}-${i}`} className="border-b border-zinc-800/60 last:border-0">
                      <td className="px-5 py-3 align-top">
                        <div className="flex items-center gap-2">
                          {resp.isCorrect ? (
                            <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <span className="text-zinc-200">{resp.userName}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 align-top ${resp.isCorrect ? 'text-zinc-400' : 'text-red-300'}`}>
                        {resp.chosen?.trim() ? resp.chosen : <span className="text-zinc-600 italic">No answer</span>}
                      </td>
                      <td className="px-5 py-3 align-top text-right text-zinc-500 whitespace-nowrap">
                        {fmtDate(resp.takenAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
