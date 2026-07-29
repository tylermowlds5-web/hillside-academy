'use client'

// Per-type question renderers for taking a quiz, shared by the video quiz
// flow, standalone quizzes, and any future quiz-taking surface. The parent
// owns the answers state; each block reports changes via onChange.

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
import type { QuizQuestion, QuizSubmittedAnswer } from '@/lib/types'
import { quizQuestionType } from '@/lib/types'

export function isAnswered(q: QuizQuestion, answer: QuizSubmittedAnswer | undefined): boolean {
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

// ── Individual question renderer ─────────────────────────────────────────

export function QuestionBlock({
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
