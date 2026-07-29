'use client'

import { useState, useRef, useEffect } from 'react'
import type { QuizPayload } from '@/app/actions'
import type { Quiz } from '@/lib/types'
import {
  QuestionEditor,
  defaultQuestion,
  questionToDraft,
  draftToQuestion,
  validateQuestionDrafts,
  draftHasContent,
  serializeDraft,
  type QuestionDraft,
} from '../../../QuestionEditor'

// ── Main builder ─────────────────────────────────────────────────────────

export default function QuizBuilder({
  existing,
  onSave,
  saveLabel = 'Save Quiz',
  updateLabel = 'Update Quiz',
  onDirtyChange,
}: {
  // Initial values; null = new quiz.
  existing: Pick<Quiz, 'passing_score' | 'questions'> | null
  // Server-action or async callback that persists the payload. Lets the same
  // builder drive both video quizzes and standalone quizzes — the caller wires
  // up the storage (saveQuiz for videos, saveStandaloneQuiz for standalone).
  onSave: (payload: QuizPayload) => Promise<void>
  saveLabel?: string
  updateLabel?: string
  // Reports whether there are unsaved changes worth warning about on close.
  // Fires true once real content exists AND it differs from the loaded/saved
  // baseline; resets to false after a successful save.
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [passingScore, setPassingScore] = useState(existing?.passing_score ?? 70)
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => {
    if (existing && existing.questions.length > 0) {
      return existing.questions.map(questionToDraft)
    }
    return [defaultQuestion('multiple_choice')]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Baseline the current draft is compared against to detect unsaved changes.
  // Seeded on first render from the initial draft, then re-baselined on save.
  const baselineRef = useRef<string | null>(null)
  if (baselineRef.current === null) baselineRef.current = serializeDraft(questions, passingScore)

  useEffect(() => {
    if (!onDirtyChange) return
    const dirty =
      draftHasContent(questions) && serializeDraft(questions, passingScore) !== baselineRef.current
    onDirtyChange(dirty)
  }, [questions, passingScore, onDirtyChange])

  function updateQuestion(i: number, q: QuestionDraft) {
    setQuestions((prev) => prev.map((old, idx) => (idx === i ? q : old)))
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setError(null)
    setSaved(false)

    const validationError = validateQuestionDrafts(questions)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const payload: QuizPayload = {
        passing_score: passingScore,
        questions: questions.map(draftToQuestion),
      }
      await onSave(payload)
      // Re-baseline so the just-saved state is no longer considered unsaved.
      baselineRef.current = serializeDraft(questions, passingScore)
      onDirtyChange?.(false)
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Quiz settings */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-full">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Quiz Settings</h3>
        <div className="w-40">
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Passing Score (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(parseInt(e.target.value, 10) || 70)}
            className="w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3 w-full max-w-full">
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
        onClick={() => setQuestions((prev) => [...prev, defaultQuestion('multiple_choice')])}
        className="w-full py-2.5 min-h-[44px] rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 text-sm transition-colors cursor-pointer"
      >
        + Add Question
      </button>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400 w-full max-w-full break-words">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-4 py-3 text-sm text-emerald-400 w-full max-w-full">
          Quiz saved successfully.
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 min-h-[48px] rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium text-sm transition-colors cursor-pointer"
      >
        {saving ? 'Saving…' : existing ? updateLabel : saveLabel}
      </button>
    </div>
  )
}
