'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { Quiz, QuizQuestion, QuizSubmittedAnswer } from '@/lib/types'
import { quizQuestionType } from '@/lib/types'

type Result = {
  score: number
  passed: boolean
  total: number
  correct: number
}

function isAnswered(q: QuizQuestion, answer: QuizSubmittedAnswer | undefined): boolean {
  const type = quizQuestionType(q)
  if (answer === undefined) return false
  if (type === 'sequence') {
    const n = (q.sequence_items ?? []).length
    return Array.isArray(answer) && answer.length === n && answer.every((x) => typeof x === 'number' && x >= 0)
  }
  if (type === 'multiple_select') return Array.isArray(answer) && answer.length > 0
  if (type === 'short_answer') return typeof answer === 'string' && answer.trim().length > 0
  return typeof answer === 'number' && answer >= 0
}

export default function QuizCard({
  quiz,
  passingScore,
  onSubmit,
  onComplete,
  failureMode = 'rewatch',
}: {
  // The quiz to render. Only `id` and `questions` are read.
  quiz: Pick<Quiz, 'id' | 'questions'>
  passingScore: number
  // How to submit the answers. Lets the same card drive both video and
  // standalone quiz flows — the page wires up the right server action.
  onSubmit: (answers: Record<number, QuizSubmittedAnswer>) => Promise<Result>
  onComplete: (passed: boolean) => void
  // Controls the failure screen messaging. 'rewatch' = video flow (must rewatch
  // before retaking); 'retake' = standalone flow (immediate retake allowed).
  failureMode?: 'rewatch' | 'retake'
}) {
  const [answers, setAnswers] = useState<Record<number, QuizSubmittedAnswer>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const questions = quiz.questions
  const answeredCount = questions.reduce(
    (sum, q, qi) => sum + (isAnswered(q, answers[qi]) ? 1 : 0),
    0
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (answeredCount < questions.length) {
      setError('Please answer all questions before submitting.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await onSubmit(answers)
      setResult(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Result screen ─────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            result.passed ? 'bg-emerald-500/20' : 'bg-red-500/20'
          }`}>
            {result.passed ? (
              <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <h3 className={`text-2xl font-bold mb-1 ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
            {result.passed ? 'Passed!' : 'Not quite'}
          </h3>
          <p className="text-zinc-400 text-sm mb-6">
            You got {result.correct} of {result.total} questions correct
          </p>

          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="48" fill="none" stroke="#27272a" strokeWidth="8" />
                <circle cx="56" cy="56" r="48" fill="none"
                  stroke={result.passed ? '#10b981' : '#ef4444'} strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 48}`}
                  strokeDashoffset={`${2 * Math.PI * 48 * (1 - result.score / 100)}`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.score}%
                </span>
                <span className="text-xs text-zinc-500">score</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-zinc-500 mb-6">Passing score: {passingScore}%</p>

          {result.passed ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-300 font-medium">Quiz complete!</p>
              <button
                onClick={() => onComplete(true)}
                className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : failureMode === 'rewatch' ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-950/60 border border-amber-800 px-4 py-3 text-sm text-amber-300 flex items-start gap-2.5 text-left max-w-sm mx-auto">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                You must rewatch the video before retaking the quiz.
              </div>
              <button
                onClick={() => onComplete(false)}
                className="px-6 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors cursor-pointer"
              >
                Rewatch Video
              </button>
            </div>
          ) : (
            // Standalone-quiz failure: no video to rewatch — just let them try
            // again. The "Try again" button resets the local result state so
            // they can re-submit.
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">You can try this quiz again.</p>
              <button
                onClick={() => {
                  setResult(null)
                  setAnswers({})
                }}
                className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Quiz form ─────────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden w-full max-w-full">
      <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-zinc-50">Knowledge Check</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {questions.length} questions · Passing score: {passingScore}%
          </p>
        </div>
        <div className="text-sm text-zinc-500">
          {answeredCount}/{questions.length} answered
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
        {questions.map((q, qi) => (
          <QuestionBlock
            key={qi}
            q={q}
            qi={qi}
            answer={answers[qi]}
            onChange={(a) => setAnswers((prev) => ({ ...prev, [qi]: a }))}
          />
        ))}

        {error && (
          <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 min-h-[48px] rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors cursor-pointer"
        >
          {submitting ? 'Submitting…' : 'Submit Quiz'}
        </button>
      </form>
    </div>
  )
}

// ── Individual question renderer ─────────────────────────────────────────

function QuestionBlock({
  q,
  qi,
  answer,
  onChange,
}: {
  q: QuizQuestion
  qi: number
  answer: QuizSubmittedAnswer | undefined
  onChange: (a: QuizSubmittedAnswer) => void
}) {
  const type = quizQuestionType(q)
  const answered = isAnswered(q, answer)

  return (
    <div className="space-y-3 w-full max-w-full">
      <p className="text-sm font-medium text-zinc-200 break-words">
        <span className="text-zinc-500 mr-2">{qi + 1}.</span>
        {q.question_text}
      </p>

      {/* Optional image — can be attached to any question type */}
      {q.image_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={q.image_url}
          alt="Question"
          className="rounded-lg border border-zinc-800 max-h-80 w-auto max-w-full"
        />
      )}

      {/* Single-choice option list (multiple_choice, true_false) */}
      {(type === 'multiple_choice' || type === 'true_false') && (
        <div className="space-y-2">
          {(q.options ?? []).map((opt, oi) => {
            const selected = answer === oi
            return (
              <button
                type="button"
                key={oi}
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(oi)}
                className={`flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-lg border w-full text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  selected ? 'border-emerald-500' : 'border-zinc-600'
                }`}>
                  {selected && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                </div>
                <span className="text-sm text-zinc-200 break-words min-w-0">{opt.option_text}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Multiple-select: checkboxes */}
      {type === 'multiple_select' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Check all that apply</p>
          {(q.options ?? []).map((opt, oi) => {
            const picked = Array.isArray(answer) && (answer as number[]).includes(oi)
            return (
              <button
                type="button"
                key={oi}
                role="checkbox"
                aria-checked={picked}
                onClick={() => {
                  const curr = Array.isArray(answer) ? (answer as number[]) : []
                  const next = picked ? curr.filter((i) => i !== oi) : [...curr, oi].sort((a, b) => a - b)
                  onChange(next)
                }}
                className={`flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-lg border w-full text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  picked ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  picked ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'
                }`}>
                  {picked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-zinc-200 break-words min-w-0">{opt.option_text}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Short answer */}
      {type === 'short_answer' && (
        <div>
          <input
            type="text"
            value={typeof answer === 'string' ? answer : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your answer"
            className="w-full max-w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
          />
        </div>
      )}

      {/* Sequence / order the steps */}
      {type === 'sequence' && <SequenceQuestion q={q} onChange={onChange} />}

      {!answered && type !== 'sequence' && (
        <p className="text-xs text-zinc-600">
          {type === 'short_answer' ? 'Type an answer' : type === 'multiple_select' ? 'Select at least one option' : 'Select an answer'}
        </p>
      )}
    </div>
  )
}

// ── Sequence taker: shuffled bank + numbered slots, drag & drop ────────────
// Touch, mouse, and keyboard are all supported via dnd-kit sensors. The chosen
// answer is a number[] where position p holds the original index (into
// q.sequence_items) of the item dropped into slot p, or -1 if the slot is empty.

type SeqItem = { id: string; originalIndex: number; text: string }
type Placement = { bank: string[]; slots: (string | null)[] }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function DraggableChip({ item, idle }: { item: SeqItem; idle?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg border text-sm select-none touch-none cursor-grab active:cursor-grabbing transition-colors ${
        idle ? 'border-zinc-700 bg-zinc-800 text-zinc-200' : 'border-emerald-600 bg-emerald-500/10 text-zinc-50'
      } ${isDragging ? 'opacity-90 z-20 shadow-xl shadow-black/40' : ''}`}
    >
      <svg className="w-4 h-4 flex-shrink-0 text-zinc-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM15 4a1 1 0 11-2 0 1 1 0 012 0zM15 10a1 1 0 11-2 0 1 1 0 012 0zM15 16a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>
      <span className="break-words min-w-0">{item.text}</span>
    </div>
  )
}

function Slot({ position, item }: { position: number; item: SeqItem | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${position}` })
  return (
    <div className="flex items-stretch gap-2">
      <span className="flex-shrink-0 w-16 flex items-center justify-center text-xs font-medium text-zinc-500">
        Step {position + 1}
      </span>
      <div
        ref={setNodeRef}
        className={`flex-1 min-w-0 rounded-lg border-2 border-dashed min-h-[48px] flex items-center p-1.5 transition-colors ${
          isOver ? 'border-emerald-500 bg-emerald-500/10' : item ? 'border-transparent' : 'border-zinc-700 bg-zinc-900/40'
        }`}
      >
        {item ? (
          <div className="w-full">
            <DraggableChip item={item} />
          </div>
        ) : (
          <span className="text-xs text-zinc-600 px-2">Drop a step here</span>
        )}
      </div>
    </div>
  )
}

function SequenceQuestion({
  q,
  onChange,
}: {
  q: QuizQuestion
  onChange: (a: QuizSubmittedAnswer) => void
}) {
  const items: SeqItem[] = useMemo(
    () => (q.sequence_items ?? []).map((text, i) => ({ id: `it-${i}`, originalIndex: i, text })),
    [q.sequence_items]
  )
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  // Shuffle once on mount; all items start in the bank.
  const [placement, setPlacement] = useState<Placement>(() => ({
    bank: shuffle(items.map((it) => it.id)),
    slots: items.map(() => null),
  }))

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const { setNodeRef: setBankRef, isOver: bankIsOver } = useDroppable({ id: 'bank' })

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const itemId = String(active.id)
    const target = String(over.id)

    // Pull the item out of its current location.
    const bank = placement.bank.filter((id) => id !== itemId)
    const slots = placement.slots.map((id) => (id === itemId ? null : id))
    const sourceSlot = placement.slots.findIndex((id) => id === itemId) // -1 if it came from the bank

    if (target === 'bank') {
      if (!bank.includes(itemId)) bank.push(itemId)
    } else if (target.startsWith('slot-')) {
      const slotIdx = parseInt(target.slice(5), 10)
      if (Number.isNaN(slotIdx) || slotIdx < 0 || slotIdx >= slots.length) return
      const displaced = slots[slotIdx]
      slots[slotIdx] = itemId
      if (displaced && displaced !== itemId) {
        // Swap with the slot we came from, otherwise return the displaced item to the bank.
        if (sourceSlot >= 0) slots[sourceSlot] = displaced
        else bank.push(displaced)
      }
    } else {
      return
    }

    setPlacement({ bank, slots })
    onChange(slots.map((id) => (id ? itemById.get(id)?.originalIndex ?? -1 : -1)))
  }

  const bankItems = placement.bank.map((id) => itemById.get(id)).filter((it): it is SeqItem => !!it)
  const placedCount = placement.slots.filter(Boolean).length

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Numbered slots */}
        <div className="space-y-2">
          {placement.slots.map((id, p) => (
            <Slot key={p} position={p} item={id ? itemById.get(id) ?? null : null} />
          ))}
        </div>

        {/* Bank of remaining items */}
        <div
          ref={setBankRef}
          className={`rounded-xl border p-3 transition-colors ${
            bankIsOver ? 'border-emerald-500 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40'
          }`}
        >
          <p className="text-xs text-zinc-500 mb-2">
            {bankItems.length > 0 ? 'Drag each step into the correct slot above' : 'All steps placed — rearrange the slots if needed'}
          </p>
          {bankItems.length > 0 ? (
            <div className="space-y-2">
              {bankItems.map((it) => (
                <DraggableChip key={it.id} item={it} idle />
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 py-1">Bank is empty.</p>
          )}
        </div>

        {placedCount < placement.slots.length && (
          <p className="text-xs text-zinc-600">
            Place all {placement.slots.length} steps ({placedCount}/{placement.slots.length} done)
          </p>
        )}
      </div>
    </DndContext>
  )
}
