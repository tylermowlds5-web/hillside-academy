'use client'

import { useState } from 'react'
import { saveQuiz, type QuizPayload } from '@/app/actions'
import type { Quiz } from '@/lib/types'

type OptionDraft = { option_text: string; is_correct: boolean }
type QuestionDraft = { question_text: string; options: OptionDraft[] }

const emptyOption = (): OptionDraft => ({ option_text: '', is_correct: false })
const emptyQuestion = (): QuestionDraft => ({
  question_text: '',
  options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
})

function QuestionEditor({
  q,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  q: QuestionDraft
  index: number
  onChange: (q: QuestionDraft) => void
  onRemove: () => void
  canRemove: boolean
}) {
  function setCorrect(oi: number) {
    onChange({
      ...q,
      options: q.options.map((o, i) => ({ ...o, is_correct: i === oi })),
    })
  }

  function setOption(oi: number, text: string) {
    onChange({
      ...q,
      options: q.options.map((o, i) => (i === oi ? { ...o, option_text: text } : o)),
    })
  }

  function addOption() {
    if (q.options.length < 6) onChange({ ...q, options: [...q.options, emptyOption()] })
  }

  function removeOption(oi: number) {
    if (q.options.length <= 2) return
    const next = q.options.filter((_, i) => i !== oi)
    if (!next.some((o) => o.is_correct) && next.length > 0) next[0].is_correct = true
    onChange({ ...q, options: next })
  }

  const hasCorrect = q.options.some((o) => o.is_correct)

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-zinc-500 text-sm font-medium mt-2.5 flex-shrink-0">Q{index + 1}</span>
        <textarea
          value={q.question_text}
          onChange={(e) => onChange({ ...q, question_text: e.target.value })}
          placeholder="Enter question…"
          rows={2}
          className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-emerald-500 resize-none"
        />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-2 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-2 pl-6">
        <p className="text-xs text-zinc-500 mb-1">Options — click circle to mark correct answer</p>
        {q.options.map((opt, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrect(oi)}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                opt.is_correct ? 'border-emerald-500' : 'border-zinc-600 hover:border-zinc-400'
              }`}
            >
              {opt.is_correct && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
            </button>
            <input
              type="text"
              value={opt.option_text}
              onChange={(e) => setOption(oi, e.target.value)}
              placeholder={`Option ${oi + 1}`}
              className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-emerald-500"
            />
            {q.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(oi)}
                className="text-zinc-700 hover:text-red-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1">
          {!hasCorrect && (
            <p className="text-xs text-amber-500">Mark a correct answer</p>
          )}
          {q.options.length < 6 && (
            <button
              type="button"
              onClick={addOption}
              className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
            >
              + Add option
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function QuizBuilder({
  videoId,
  existing,
}: {
  videoId: string
  existing: Quiz | null
}) {
  const [passingScore, setPassingScore] = useState(existing?.passing_score ?? 70)
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => {
    if (existing && existing.questions.length > 0) {
      return existing.questions.map((q) => ({
        question_text: q.question_text,
        options: q.options.map((o) => ({ option_text: o.option_text, is_correct: o.is_correct })),
      }))
    }
    return [emptyQuestion()]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function updateQuestion(i: number, q: QuestionDraft) {
    setQuestions((prev) => prev.map((old, idx) => (idx === i ? q : old)))
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setError(null)
    setSaved(false)

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question_text.trim()) { setError(`Question ${i + 1} is empty`); return }
      if (!q.options.some((o) => o.is_correct)) { setError(`Question ${i + 1} has no correct answer`); return }
      if (q.options.some((o) => !o.option_text.trim())) { setError(`Question ${i + 1} has empty options`); return }
    }

    setSaving(true)
    try {
      const payload: QuizPayload = {
        passing_score: passingScore,
        questions,
      }
      await saveQuiz(videoId, payload)
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Quiz settings */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Quiz Settings</h3>
        <div className="w-40">
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Passing Score (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(parseInt(e.target.value, 10) || 70)}
            className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
            onChange={(updated) => updateQuestion(i, updated)}
            onRemove={() => removeQuestion(i)}
            canRemove={questions.length > 1}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
        className="w-full py-2.5 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 text-sm transition-colors"
      >
        + Add Question
      </button>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-4 py-3 text-sm text-emerald-400">
          Quiz saved successfully.
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium text-sm transition-colors"
      >
        {saving ? 'Saving…' : existing ? 'Update Quiz' : 'Save Quiz'}
      </button>
    </div>
  )
}
