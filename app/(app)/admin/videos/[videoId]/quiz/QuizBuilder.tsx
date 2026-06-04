'use client'

import { useState, useRef } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QuizPayload } from '@/app/actions'
import type { Quiz, QuizQuestionType } from '@/lib/types'
import { quizQuestionType, quizAcceptedAnswers } from '@/lib/types'

type OptionDraft = { option_text: string; is_correct: boolean }

type QuestionDraft = {
  type: QuizQuestionType
  question_text: string
  options: OptionDraft[]
  image_url: string | null
  correct_answers: string[]
  // sequence ("order the steps") — items in the correct order
  sequence_items: string[]
  partial_credit: boolean
  // Item-index groups (each contiguous in canonical order, no overlap). Items
  // in the same group may be placed in any order across the group's positions.
  sequence_groups: number[][]
}

const emptyOption = (): OptionDraft => ({ option_text: '', is_correct: false })

function defaultQuestion(type: QuizQuestionType = 'multiple_choice'): QuestionDraft {
  const base = { question_text: '', options: [], image_url: null, correct_answers: [], sequence_items: [], partial_credit: false, sequence_groups: [] }
  switch (type) {
    case 'true_false':
      return {
        ...base,
        type,
        options: [
          { option_text: 'True', is_correct: false },
          { option_text: 'False', is_correct: false },
        ],
      }
    case 'short_answer':
      return { ...base, type, correct_answers: [''] }
    case 'sequence':
      return { ...base, type, sequence_items: ['', '', ''], partial_credit: true }
    case 'multiple_select':
    case 'multiple_choice':
    default:
      return {
        ...base,
        type,
        options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
      }
  }
}

const TYPE_LABEL: Record<QuizQuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  multiple_select: 'Multiple Select (choose all that apply)',
  short_answer: 'Short Answer',
  sequence: 'Sequence / Order the Steps',
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

// ── Sequence editor ──────────────────────────────────────────────────────
// Admin arranges the steps top-to-bottom in the CORRECT order. Rows are
// drag-reorderable (touch + mouse + keyboard) and the step number reflects the
// current position. Stable ids keep React/dnd-kit happy while text is edited.

type StepDraft = { id: string; text: string }

let stepIdSeq = 0
const newStepId = () => `step-${Date.now()}-${stepIdSeq++}`

function SortableStep({
  step,
  position,
  canRemove,
  selected,
  groupRole,
  onToggleSelect,
  onChange,
  onRemove,
}: {
  step: StepDraft
  position: number
  canRemove: boolean
  selected: boolean
  // Where this step sits inside its group, if any. Drives the visual bracket:
  // 'single' (lone row group — shouldn't happen in practice), 'first', 'middle',
  // 'last', or null (not grouped).
  groupRole: 'first' | 'middle' | 'last' | 'single' | null
  onToggleSelect: () => void
  onChange: (text: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  // Left bracket styling: violet bar attached to the row, with rounded corners
  // on the first/last rows so contiguous group members read as a single block.
  const inGroup = groupRole !== null
  const bracketRounding =
    groupRole === 'first' ? 'rounded-t-md' :
    groupRole === 'last' ? 'rounded-b-md' :
    groupRole === 'single' ? 'rounded-md' : ''

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-2 ${inGroup ? 'pl-3' : ''} ${isDragging ? 'opacity-60 z-10' : ''}`}
    >
      {/* Group bracket — only rendered for grouped rows. */}
      {inGroup && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-1 bg-violet-500/70 ${bracketRounding}`}
        />
      )}
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-2 -ml-1 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
        aria-label="Drag to reorder step"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM15 4a1 1 0 11-2 0 1 1 0 012 0zM15 10a1 1 0 11-2 0 1 1 0 012 0zM15 16a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      </button>
      {/* Step number doubles as the selection toggle for grouping. */}
      <button
        type="button"
        onClick={onToggleSelect}
        title={selected ? 'Click to deselect' : 'Click to select for grouping'}
        aria-pressed={selected}
        className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${
          selected
            ? 'bg-violet-500 text-white ring-2 ring-violet-400/50'
            : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
        }`}
      >
        {position + 1}
      </button>
      <input
        type="text"
        value={step.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Step ${position + 1}`}
        className="flex-1 min-w-0 px-3 py-2 min-h-[44px] rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-50 placeholder-zinc-600 text-sm focus:outline-none focus:border-emerald-500"
      />
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 p-2 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
          title="Remove step"
          aria-label="Remove step"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function SequenceEditor({
  q,
  onChange,
}: {
  q: QuestionDraft
  onChange: (q: QuestionDraft) => void
}) {
  // Internally, the editor tracks groups by step ID so they survive reorders
  // and re-numbering. The draft on the parent stores index-based groups; we
  // convert at the sync boundary.
  const initial = useState(() => {
    const stepsInit: StepDraft[] = (q.sequence_items.length > 0 ? q.sequence_items : ['', '', '']).map(
      (text) => ({ id: newStepId(), text })
    )
    const groupsInit: string[][] = (q.sequence_groups ?? [])
      .map((g) => g.map((i) => stepsInit[i]?.id).filter((id): id is string => !!id))
      .filter((g) => g.length >= 2)
    return { stepsInit, groupsInit }
  })[0]
  const [steps, setSteps] = useState<StepDraft[]>(initial.stepsInit)
  const [groups, setGroups] = useState<string[][]>(initial.groupsInit)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Derived lookups ──────────────────────────────────────────────────
  const stepIndexById = new Map<string, number>()
  steps.forEach((s, i) => stepIndexById.set(s.id, i))
  // step id → group index (so we know which group each row belongs to)
  const groupOfStep = new Map<string, number>()
  groups.forEach((g, gi) => g.forEach((id) => groupOfStep.set(id, gi)))

  // For each group, the sorted positions its members currently occupy. If
  // not contiguous, the group is invalid and gets dissolved by sync().
  function groupPositions(groupIdx: number): number[] {
    return groups[groupIdx]
      .map((id) => stepIndexById.get(id))
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b)
  }
  function isContiguous(positions: number[]): boolean {
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] !== positions[i - 1] + 1) return false
    }
    return positions.length > 0
  }

  // ── Sync: push step order + index-based groups to the parent draft ───
  function sync(nextSteps: StepDraft[], nextGroups: string[][]) {
    // Drop any group that's lost contiguity or fallen below 2 members in the
    // new layout — keeps the storage invariant clean even after reorder/remove.
    const nextIndex = new Map<string, number>()
    nextSteps.forEach((s, i) => nextIndex.set(s.id, i))
    const cleanedGroups = nextGroups
      .map((g) => g.filter((id) => nextIndex.has(id)))
      .filter((g) => g.length >= 2)
      .filter((g) => {
        const positions = g.map((id) => nextIndex.get(id)!).sort((a, b) => a - b)
        return isContiguous(positions)
      })

    setSteps(nextSteps)
    setGroups(cleanedGroups)
    onChange({
      ...q,
      sequence_items: nextSteps.map((s) => s.text),
      sequence_groups: cleanedGroups.map((g) =>
        g.map((id) => nextIndex.get(id)!).sort((a, b) => a - b)
      ),
    })
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = steps.findIndex((s) => s.id === active.id)
    const newIndex = steps.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    sync(arrayMove(steps, oldIndex, newIndex), groups)
  }

  // ── Selection & grouping ─────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Selection is groupable iff size ≥ 2, none of the selected steps are
  // already in a group, and the selected positions are contiguous.
  const selectedPositions = [...selected]
    .map((id) => stepIndexById.get(id))
    .filter((p): p is number => p !== undefined)
    .sort((a, b) => a - b)
  const selectionContiguous = isContiguous(selectedPositions)
  const selectionAlreadyGrouped = [...selected].some((id) => groupOfStep.has(id))
  const canGroup = selected.size >= 2 && selectionContiguous && !selectionAlreadyGrouped

  function handleGroup() {
    if (!canGroup) return
    const newGroup = [...selected]
    sync(steps, [...groups, newGroup])
    setSelected(new Set())
  }
  function handleUngroup(groupIdx: number) {
    sync(steps, groups.filter((_, i) => i !== groupIdx))
  }

  function handleRemove(i: number) {
    const removedId = steps[i].id
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(removedId)
      return next
    })
    sync(steps.filter((_, idx) => idx !== i), groups)
  }

  return (
    <div className="space-y-3 pl-6">
      <p className="text-xs text-zinc-500">
        List the steps in the <span className="text-zinc-300">correct order</span>. Drag the handle to
        rearrange. Click a step&apos;s number to select multiple, then group them so any order within the
        group counts as correct.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {steps.map((step, i) => {
              const groupIdx = groupOfStep.get(step.id)
              let role: 'first' | 'middle' | 'last' | 'single' | null = null
              if (groupIdx !== undefined) {
                const positions = groupPositions(groupIdx)
                const first = positions[0]
                const last = positions[positions.length - 1]
                role = positions.length === 1 ? 'single'
                  : i === first ? 'first'
                  : i === last ? 'last'
                  : 'middle'
              }
              return (
                <SortableStep
                  key={step.id}
                  step={step}
                  position={i}
                  canRemove={steps.length > 2}
                  selected={selected.has(step.id)}
                  groupRole={role}
                  onToggleSelect={() => toggleSelect(step.id)}
                  onChange={(text) =>
                    sync(steps.map((s, idx) => (idx === i ? { ...s, text } : s)), groups)
                  }
                  onRemove={() => handleRemove(i)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Grouping toolbar: only shown once at least one step is selected. */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-zinc-500">
            {selected.size} step{selected.size !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={handleGroup}
            disabled={!canGroup}
            title={
              selected.size < 2 ? 'Select at least two steps to group'
              : selectionAlreadyGrouped ? 'One or more of these steps is already in a group'
              : !selectionContiguous ? 'Selected steps must be next to each other'
              : 'Group these steps'
            }
            className="px-3 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Group these steps
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Clear selection
          </button>
          {selected.size >= 2 && !selectionContiguous && (
            <span className="text-amber-400">Selected steps must be next to each other.</span>
          )}
          {selectionAlreadyGrouped && (
            <span className="text-amber-400">Ungroup first to re-group.</span>
          )}
        </div>
      )}

      {/* Existing groups — one row each with the member step numbers + ungroup. */}
      {groups.length > 0 && (
        <ul className="space-y-1">
          {groups.map((g, gi) => {
            const positions = g
              .map((id) => stepIndexById.get(id))
              .filter((p): p is number => p !== undefined)
              .sort((a, b) => a - b)
            return (
              <li key={gi} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-1 h-3 rounded-sm bg-violet-500/70 inline-block" />
                <span>
                  Steps {positions.map((p) => p + 1).join(', ')} — any order counts as correct
                </span>
                <button
                  type="button"
                  onClick={() => handleUngroup(gi)}
                  className="text-violet-300 hover:text-violet-200 transition-colors cursor-pointer"
                >
                  Ungroup
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => sync([...steps, { id: newStepId(), text: '' }], groups)}
        className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
      >
        + Add step
      </button>

      {/* Partial credit toggle */}
      <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
        <button
          type="button"
          role="switch"
          aria-checked={q.partial_credit}
          onClick={() => onChange({ ...q, partial_credit: !q.partial_credit })}
          className={`mt-0.5 relative w-9 h-5 rounded-full flex-shrink-0 transition-colors cursor-pointer ${
            q.partial_credit ? 'bg-emerald-500' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              q.partial_credit ? 'translate-x-4' : ''
            }`}
          />
        </button>
        <span className="text-xs text-zinc-400">
          <span className="text-zinc-300 font-medium">Partial credit</span> — each correctly placed step
          counts (e.g. 3 of 4 correct = 75%). Off = all-or-nothing.
        </span>
      </label>
    </div>
  )
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

  const hasOptions = q.type !== 'short_answer' && q.type !== 'sequence'
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

      {/* Sequence / order-the-steps editor */}
      {q.type === 'sequence' && <SequenceEditor q={q} onChange={onChange} />}

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
  existing,
  onSave,
  saveLabel = 'Save Quiz',
  updateLabel = 'Update Quiz',
}: {
  // Initial values; null = new quiz.
  existing: Pick<Quiz, 'passing_score' | 'questions'> | null
  // Server-action or async callback that persists the payload. Lets the same
  // builder drive both video quizzes and standalone quizzes — the caller wires
  // up the storage (saveQuiz for videos, saveStandaloneQuiz for standalone).
  onSave: (payload: QuizPayload) => Promise<void>
  saveLabel?: string
  updateLabel?: string
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
          sequence_items: q.sequence_items ?? base.sequence_items,
          partial_credit: q.partial_credit ?? base.partial_credit,
          sequence_groups: q.sequence_groups ?? base.sequence_groups,
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
      } else if (q.type === 'sequence') {
        const cleaned = q.sequence_items.map((s) => s.trim()).filter((s) => s.length > 0)
        if (cleaned.length < 2) {
          setError(`Question ${i + 1}: add at least 2 steps to order`); return
        }
        if (q.sequence_items.some((s) => !s.trim())) {
          setError(`Question ${i + 1}: every step needs text`); return
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
          if (q.type === 'sequence') {
            // Filter empty items out and remap group indices so they reference
            // the trimmed item list (drop any group that's lost members below 2).
            const trimmedItems: string[] = []
            const oldToNewIndex = new Map<number, number>()
            q.sequence_items.forEach((raw, oldIdx) => {
              const trimmed = raw.trim()
              if (trimmed.length > 0) {
                oldToNewIndex.set(oldIdx, trimmedItems.length)
                trimmedItems.push(trimmed)
              }
            })
            const remappedGroups = q.sequence_groups
              .map((g) => g.map((i) => oldToNewIndex.get(i)).filter((i): i is number => i !== undefined))
              .filter((g) => g.length >= 2)
            return {
              type: 'sequence',
              question_text: q.question_text.trim(),
              sequence_items: trimmedItems,
              partial_credit: q.partial_credit,
              ...(remappedGroups.length > 0 ? { sequence_groups: remappedGroups } : {}),
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
      await onSave(payload)
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
