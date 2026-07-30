'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { QuizQuestion, QuizQuestionType } from '@/lib/types'
import {
  QuestionEditor,
  defaultQuestion,
  questionToDraft,
  draftToQuestion,
  validateQuestionDrafts,
  TYPE_LABEL,
  type QuestionDraft,
} from '@/app/(app)/admin/QuestionEditor'
import {
  saveCertGroup,
  deleteCertGroup,
  saveCertGroupQuestions,
  saveCertStandaloneQuestions,
} from '@/app/cert-admin-actions'

// ── Unified question bank editor ─────────────────────────────────────────
// ONE list of units, one "+ Add question" action. A unit is a standalone
// question of any type OR a photo group ("photo group" is just the sixth
// choice in the type picker; picking it edits the shared photo + linked
// questions inline). Pure UI structure — persistence still writes standalone
// rows and group rows exactly as before, and each unit remains one drawable
// unit with per-part scoring inside groups.

export type BankGroup = {
  id: string
  label: string
  imageUrl: string | null
  questions: QuizQuestion[]
}

type Unit =
  | { kind: 'question'; key: string; draft: QuestionDraft }
  | {
      kind: 'group'
      key: string
      id: string | null // null until first save creates the DB row
      label: string
      imageUrl: string | null
      drafts: QuestionDraft[]
    }

let unitSeq = 0
const newKey = () => `unit-${Date.now()}-${unitSeq++}`

async function uploadCertImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('prefix', 'cert-images')
  const res = await fetch('/api/upload-thumbnail', { method: 'POST', body: fd })
  const json = await res.json()
  if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
  return json.url
}

// ── Photo-group unit body: shared photo + label + linked questions ────────

function GroupUnitBody({
  unit,
  onChange,
}: {
  unit: Extract<Unit, { kind: 'group' }>
  onChange: (patch: Partial<Pick<Extract<Unit, { kind: 'group' }>, 'label' | 'imageUrl' | 'drafts'>>) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      onChange({ imageUrl: await uploadCertImage(file) })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        {/* Shared photo */}
        <div className="flex-shrink-0">
          <p className="text-xs font-medium text-plum/60 mb-1.5">
            Photo <span className="text-plum/40">(shown once above the linked questions)</span>
          </p>
          <div className="flex items-center gap-3">
            {unit.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={unit.imageUrl} alt="" className="h-24 w-36 object-cover rounded-lg border border-plum/20" />
            ) : (
              <div className="h-24 w-36 rounded-lg border border-dashed border-plum/25 flex items-center justify-center text-xs text-plum/40">
                No photo
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-xs text-emerald-700 hover:text-emerald-800 px-3 py-2 rounded bg-emerald-600/10 hover:bg-emerald-600/15 cursor-pointer text-center">
                {uploading ? 'Uploading…' : unit.imageUrl ? 'Replace photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
              </label>
              {unit.imageUrl && (
                <button
                  type="button"
                  onClick={() => onChange({ imageUrl: null })}
                  className="block w-full text-xs text-plum/50 hover:text-plum/70"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
          {uploadError && <p className="mt-1.5 text-xs text-red-600">{uploadError}</p>}
        </div>

        {/* Admin label */}
        <div className="flex-1 min-w-52">
          <p className="text-xs font-medium text-plum/60 mb-1.5">
            Label <span className="text-plum/40">(admin-only — usually the plant name; employees never see it)</span>
          </p>
          <input
            type="text"
            value={unit.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="e.g. Boxwood"
            className="w-full px-3 py-2.5 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      {/* Linked questions (each scored separately) */}
      <div className="space-y-4">
        {unit.drafts.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
            light
            onChange={(next) => onChange({ drafts: unit.drafts.map((x, xi) => (xi === i ? next : x)) })}
            onRemove={() => onChange({ drafts: unit.drafts.filter((_, xi) => xi !== i) })}
            canRemove={unit.drafts.length > 1}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange({ drafts: [...unit.drafts, defaultQuestion('multiple_choice')] })}
        className="text-xs text-plum/50 hover:text-emerald-700 transition-colors"
      >
        + Add linked question
      </button>
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────

const GROUP_CHOICE = 'photo_group' as const
type AddChoice = QuizQuestionType | typeof GROUP_CHOICE

export default function BankEditorClient({
  requirementId,
  initialGroups,
  initialStandalone,
}: {
  requirementId: string
  initialGroups: BankGroup[]
  initialStandalone: QuizQuestion[]
}) {
  const router = useRouter()
  const [units, setUnits] = useState<Unit[]>(() => [
    ...initialStandalone.map<Unit>((q) => ({ kind: 'question', key: newKey(), draft: questionToDraft(q) })),
    ...initialGroups.map<Unit>((g) => ({
      kind: 'group',
      key: newKey(),
      id: g.id,
      label: g.label,
      imageUrl: g.imageUrl,
      drafts: g.questions.length > 0 ? g.questions.map(questionToDraft) : [defaultQuestion('multiple_choice')],
    })),
  ])
  // Existing groups removed from the list — deleted from the DB on save,
  // so removals and edits commit together.
  const deletedGroupIds = useRef<string[]>([])

  const [chooserOpen, setChooserOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addUnit(choice: AddChoice) {
    setChooserOpen(false)
    setSaved(false)
    setUnits((prev) => [
      ...prev,
      choice === GROUP_CHOICE
        ? { kind: 'group', key: newKey(), id: null, label: '', imageUrl: null, drafts: [defaultQuestion('multiple_choice')] }
        : { kind: 'question', key: newKey(), draft: defaultQuestion(choice) },
    ])
  }

  function removeUnit(idx: number) {
    const unit = units[idx]
    if (unit.kind === 'group') {
      if (!confirm('Remove this photo group and its linked questions? The removal is applied when you save the bank.')) return
      if (unit.id) deletedGroupIds.current.push(unit.id)
    }
    setSaved(false)
    setUnits((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateUnit(idx: number, next: Unit) {
    setSaved(false)
    setUnits((prev) => prev.map((u, i) => (i === idx ? next : u)))
  }

  function validate(): string | null {
    for (let i = 0; i < units.length; i++) {
      const u = units[i]
      const drafts = u.kind === 'question' ? [u.draft] : u.drafts
      const err = validateQuestionDrafts(drafts)
      if (err) return `Unit ${i + 1}${u.kind === 'group' ? ' (photo group)' : ''}: ${err}`
    }
    return null
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      // Standalone questions: wholesale replace in list order.
      const standalone = units
        .filter((u): u is Extract<Unit, { kind: 'question' }> => u.kind === 'question')
        .map((u) => draftToQuestion(u.draft))
      await saveCertStandaloneQuestions(requirementId, standalone)

      // Groups: create missing rows, update the rest, replace their questions.
      const idByKey = new Map<string, string>()
      for (const u of units) {
        if (u.kind !== 'group') continue
        const { id } = await saveCertGroup({
          groupId: u.id ?? undefined,
          requirementId,
          label: u.label,
          imageUrl: u.imageUrl,
        })
        idByKey.set(u.key, id)
        await saveCertGroupQuestions(id, u.drafts.map(draftToQuestion))
      }

      // Deletions last, so a failed save above leaves nothing half-removed.
      for (const gid of deletedGroupIds.current) {
        await deleteCertGroup(gid)
      }
      deletedGroupIds.current = []

      // Stamp freshly-created group ids so a re-save updates instead of duplicating.
      setUnits((prev) =>
        prev.map((u) =>
          u.kind === 'group' && !u.id && idByKey.has(u.key) ? { ...u, id: idByKey.get(u.key)! } : u
        )
      )
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {units.length === 0 && (
        <div className="rounded-xl border border-dashed border-plum/20 px-4 py-8 text-center">
          <p className="text-sm text-plum/50">
            No questions yet. Add your first below — any question type, or a photo group
            (one shared photo with linked questions).
          </p>
        </div>
      )}

      {/* One unified unit list */}
      {units.map((unit, i) => (
        <section key={unit.key} className="rounded-2xl border border-plum/10 bg-white shadow-sm p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50 whitespace-nowrap">
                Unit {i + 1}
              </h2>
              <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider bg-plum/10 text-plum/60 px-2 py-0.5 rounded-full">
                {unit.kind === 'group' ? 'Photo group' : TYPE_LABEL[unit.draft.type]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => removeUnit(i)}
              className="flex-shrink-0 text-xs text-red-600 hover:text-red-500 px-2 py-1.5 rounded hover:bg-red-500/10"
            >
              Remove
            </button>
          </div>

          {unit.kind === 'question' ? (
            <QuestionEditor
              q={unit.draft}
              index={i}
              light
              onChange={(next) => updateUnit(i, { ...unit, draft: next })}
              onRemove={() => {}}
              canRemove={false}
            />
          ) : (
            <GroupUnitBody
              unit={unit}
              onChange={(patch) => updateUnit(i, { ...unit, ...patch })}
            />
          )}
        </section>
      ))}

      {/* One add action: pick a type, photo group included */}
      {chooserOpen ? (
        <div className="rounded-2xl border border-plum/10 bg-white shadow-sm p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
              What kind of question?
            </p>
            <button
              type="button"
              onClick={() => setChooserOpen(false)}
              className="text-xs text-plum/50 hover:text-plum"
            >
              Cancel
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TYPE_LABEL) as QuizQuestionType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addUnit(type)}
                className="rounded-full border border-plum/20 bg-white px-4 py-2 text-sm font-medium text-plum/80 transition-colors hover:border-emerald-600 hover:text-emerald-700"
              >
                {TYPE_LABEL[type]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addUnit(GROUP_CHOICE)}
              className="rounded-full border border-emerald-600/40 bg-emerald-600/5 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600/10"
            >
              Photo Group — one photo, linked questions
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setChooserOpen(true)}
          className="w-full px-4 py-3 rounded-xl border border-dashed border-plum/20 hover:border-emerald-600 text-sm font-medium text-plum/70 hover:text-emerald-700 transition-colors"
        >
          + Add question
        </button>
      )}

      {/* One save for the whole bank */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save bank'}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved</span>}
        <span className="text-xs text-plum/40">
          {units.length} unit{units.length === 1 ? '' : 's'} — each is one draw
        </span>
      </div>
    </div>
  )
}
