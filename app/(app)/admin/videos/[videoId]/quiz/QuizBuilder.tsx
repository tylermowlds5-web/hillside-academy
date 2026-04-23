'use client'

import { useState, useRef } from 'react'
import { saveQuiz, type QuizPayload } from '@/app/actions'
import type { Quiz, QuizQuestionType } from '@/lib/types'
import { quizQuestionType, quizAcceptedAnswers } from '@/lib/types'

type OptionDraft = { option_text: string; is_correct: boolean }

type QuestionDraft = {
  type: QuizQuestionType
  question_text: string
  options: OptionDraft[]
  image_url: string | null
  correct_answers: string[]
}

const emptyOption = (): OptionDraft => ({ option_text: '', is_correct: false })

function defaultQuestion(type: QuizQuestionType = 'multiple_choice'): QuestionDraft {
  switch (type) {
    case 'true_false':
      return {
        type,
        question_text: '',
        options: [
          { option_text: 'True', is_correct: false },
          { option_text: 'False', is_correct: false },
        ],
        image_url: null,
        correct_answers: [],
      }
    case 'short_answer':
      return { type, question_text: '', options: [], image_url: null, correct_answers: [''] }
    case 'multiple_select':
    case 'multiple_choice':
    default:
      return {
        type,
        question_text: '',
        options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
        image_url: null,
        correct_answers: [],
      }
  }
}

const TYPE_LABEL: Record<QuizQuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  multiple_select: 'Multiple Select (choose all that apply)',
  short_answer: 'Short Answer',
}

// ── Reuses the existing thumbnail upload endpoint for images ─────────────
function uploadImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.set('file', file)
    const xhr = new XMLHttpRequest()
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { url, error } = JSON.parse(xhr.responseText)
          if (error) reject(new Error(error))
          else resolve(url as string)
        } catch {
          reject(new Error('Invalid response'))
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.open('POST', '/api/upload-thumbnail')
    xhr.send(fd)
  })
}

// ── Question editor (type-aware) ─────────────────────────────────────────

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
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  function updateType(newType: QuizQuestionType) {
    // Keep question text AND image when switching types — the image is a
    // cross-cutting feature, not specific to a question type.
    const fresh = defaultQuestion(newType)
    onChange({ ...fresh, question_text: q.question_text, image_url: q.image_url })
  }

  function setOption(oi: number, text: string) {
    onChange({
      ...q,
      options: q.options.map((o, i) => (i === oi ? { ...o, option_text: text } : o)),
    })
  }

  // For mc / tf / iq → exactly one correct (radio). For ms → any number (checkbox).
  function setCorrect(oi: number) {
    if (q.type === 'multiple_select') {
      onChange({
        ...q,
        options: q.options.map((o, i) => (i === oi ? { ...o, is_correct: !o.is_correct } : o)),
      })
    } else {
      onChange({
        ...q,
        options: q.options.map((o, i) => ({ ...o, is_correct: i === oi })),
      })
    }
  }

  function addOption() {
    if (q.options.length < 6) onChange({ ...q, options: [...q.options, emptyOption()] })
  }

  function removeOption(oi: number) {
    if (q.options.length <= 2) return
    const next = q.options.filter((_, i) => i !== oi)
    // For single-choice types, ensure at least one is_correct
    if (q.type !== 'multiple_select' && !next.some((o) => o.is_correct) && next.length > 0) {
      next[0].is_correct = true
    }
    onChange({ ...q, options: next })
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUploading(true)
    setImageError(null)
    try {
      const url = await uploadImage(file)
      onChange({ ...q, image_url: url })
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setImageUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const hasOptions = q.type !== 'short_answer'
  const isMultipleSelect = q.type === 'multiple_select'

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-3 w-full max-w-full">
      {/* Header: type + Q number + remove */}
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-zinc-500 text-sm font-medium mt-2.5 flex-shrink-0">Q{index + 1}</span>
        <select
          value={q.type}
          onChange={(e) => updateType(e.target.value as QuizQuestionType)}
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
        >
          {(Object.keys(TYPE_LABEL) as QuizQuestionType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-1 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 cursor-pointer"
            title="Remove question"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Question text */}
      <textarea
        value={q.question_text}
        onChange={(e) => onChange({ ...q, question_text: e.target.value })}
        placeholder="Enter question…"
        rows={2}
        className="w-full max-w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-emerald-500 resize-none"
      />

      {/* Image — optional for ANY question type. Shown above the question
          text to employees during the quiz. */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-400">
          Image <span className="text-zinc-600 font-normal">(optional)</span>
        </label>
        {q.image_url ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.image_url}
              alt="Question"
              className="max-h-40 rounded-lg border border-zinc-700 bg-zinc-900"
            />
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="text-xs text-zinc-400 hover:text-emerald-400 px-2 py-1 rounded hover:bg-zinc-700 cursor-pointer"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...q, image_url: null })}
                className="block text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={imageUploading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 text-sm disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {imageUploading ? 'Uploading…' : 'Add Image'}
          </button>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFile}
          className="sr-only"
        />
        {imageError && <p className="text-xs text-red-400">{imageError}</p>}
      </div>

      {/* Short-answer: list of accepted answers (any one correct = full credit) */}
      {q.type === 'short_answer' && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Accepted answers</label>
          <div className="space-y-2">
            {q.correct_answers.map((ans, ai) => (
              <div key={ai} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ans}
                  onChange={(e) => {
                    const next = [...q.correct_answers]
                    next[ai] = e.target.value
                    onChange({ ...q, correct_answers: next })
                  }}
                  placeholder={ai === 0 ? 'e.g. Rhododendron' : 'e.g. Rhody'}
                  className="flex-1 min-w-0 px-3 py-2 min-h-[44px] rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-emerald-500"
                />
                {q.correct_answers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange({
                        ...q,
                        correct_answers: q.correct_answers.filter((_, i) => i !== ai),
                      })
                    }}
                    className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 p-2 rounded hover:bg-red-500/10 cursor-pointer"
                    title="Remove this accepted answer"
                    aria-label="Remove accepted answer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...q, correct_answers: [...q.correct_answers, ''] })}
            className="mt-2 text-xs text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            + Add another accepted answer
          </button>
          <p className="text-xs text-zinc-600 mt-2">
            Any of these answers counts as correct. Case-insensitive, extra whitespace ignored.
          </p>
        </div>
      )}

      {/* Options for option-based types */}
      {hasOptions && (
        <div className="space-y-2 pl-6">
          <p className="text-xs text-zinc-500 mb-1">
            Options — {isMultipleSelect ? 'check all correct answers' : 'click circle to mark correct answer'}
          </p>
          {q.options.map((opt, oi) => {
            // T/F has fixed labels, not editable
            const isFixedLabel = q.type === 'true_false'
            return (
              <div key={oi} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCorrect(oi)}
                  className={`w-5 h-5 flex-shrink-0 border-2 flex items-center justify-center transition-colors cursor-pointer ${
                    isMultipleSelect ? 'rounded' : 'rounded-full'
                  } ${
                    opt.is_correct ? 'border-emerald-500' : 'border-zinc-600 hover:border-zinc-400'
                  }`}
                  title={isMultipleSelect ? 'Toggle correct' : 'Mark as correct'}
                >
                  {opt.is_correct && (
                    isMultipleSelect ? (
                      <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    )
                  )}
                </button>
                {isFixedLabel ? (
                  <span className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm">
                    {opt.option_text}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={opt.option_text}
                    onChange={(e) => setOption(oi, e.target.value)}
                    placeholder={`Option ${oi + 1}`}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-emerald-500"
                  />
                )}
                {q.options.length > 2 && q.type !== 'true_false' && (
                  <button
                    type="button"
                    onClick={() => removeOption(oi)}
                    className="text-zinc-700 hover:text-red-400 transition-colors cursor-pointer"
                    title="Remove option"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
          {q.type !== 'true_false' && q.options.length < 6 && (
            <button
              type="button"
              onClick={addOption}
              className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              + Add option
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main builder ─────────────────────────────────────────────────────────

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
      return existing.questions.map((q) => {
        const type = quizQuestionType(q)
        const base = defaultQuestion(type)
        const accepted = quizAcceptedAnswers(q)
        return {
          type,
          question_text: q.question_text,
          options: q.options
            ? q.options.map((o) => ({ option_text: o.option_text, is_correct: o.is_correct }))
            : base.options,
          image_url: q.image_url ?? null,
          // Always keep at least one input row visible for short_answer
          correct_answers: type === 'short_answer'
            ? (accepted.length > 0 ? accepted : [''])
            : accepted,
        }
      })
    }
    return [defaultQuestion('multiple_choice')]
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

    // Validate per-type
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.question_text.trim()) { setError(`Question ${i + 1} is empty`); return }

      if (q.type === 'short_answer') {
        const cleaned = q.correct_answers.map((a) => a.trim()).filter((a) => a.length > 0)
        if (cleaned.length === 0) {
          setError(`Question ${i + 1}: enter at least one accepted answer`); return
        }
      } else if (q.type === 'multiple_select') {
        if (q.options.some((o) => !o.option_text.trim())) { setError(`Question ${i + 1}: empty options`); return }
        if (!q.options.some((o) => o.is_correct)) { setError(`Question ${i + 1}: check at least one correct answer`); return }
      } else {
        // multiple_choice or true_false
        if (q.options.some((o) => !o.option_text.trim())) { setError(`Question ${i + 1}: empty options`); return }
        if (!q.options.some((o) => o.is_correct)) { setError(`Question ${i + 1}: mark a correct answer`); return }
      }
    }

    setSaving(true)
    try {
      const payload: QuizPayload = {
        passing_score: passingScore,
        questions: questions.map((q) => {
          // image_url is optional on every type — only include if present
          const imageField = q.image_url ? { image_url: q.image_url } : {}
          if (q.type === 'short_answer') {
            return {
              type: 'short_answer',
              question_text: q.question_text.trim(),
              correct_answers: q.correct_answers.map((a) => a.trim()).filter((a) => a.length > 0),
              ...imageField,
            }
          }
          return {
            type: q.type,
            question_text: q.question_text.trim(),
            options: q.options.map((o) => ({
              option_text: o.option_text.trim(),
              is_correct: o.is_correct,
            })),
            ...imageField,
          }
        }),
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
        {saving ? 'Saving…' : existing ? 'Update Quiz' : 'Save Quiz'}
      </button>
    </div>
  )
}
