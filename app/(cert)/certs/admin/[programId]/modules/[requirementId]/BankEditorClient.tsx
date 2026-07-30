'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { QuizQuestion } from '@/lib/types'
import {
  QuestionEditor,
  defaultQuestion,
  questionToDraft,
  draftToQuestion,
  validateQuestionDrafts,
  type QuestionDraft,
} from '@/app/(app)/admin/QuestionEditor'
import {
  saveCertGroup,
  deleteCertGroup,
  saveCertGroupQuestions,
  saveCertStandaloneQuestions,
} from '@/app/cert-admin-actions'

// Question-bank editor: one card per group (photo + label + linked
// questions). Groups save individually; questions reuse the shared
// QuestionEditor drafts/validation from the quiz builder.

export type BankGroup = {
  id: string
  label: string
  imageUrl: string | null
  questions: QuizQuestion[]
}

async function uploadCertImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('prefix', 'cert-images')
  const res = await fetch('/api/upload-thumbnail', { method: 'POST', body: fd })
  const json = await res.json()
  if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
  return json.url
}

function GroupCard({
  group,
  index,
  requirementId,
  onDeleted,
}: {
  group: BankGroup
  index: number
  requirementId: string
  onDeleted: () => void
}) {
  const [label, setLabel] = useState(group.label)
  const [imageUrl, setImageUrl] = useState(group.imageUrl)
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    group.questions.length > 0
      ? group.questions.map(questionToDraft)
      : [defaultQuestion('multiple_choice')]
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      setImageUrl(await uploadCertImage(file))
      setSaved(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
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
      await saveCertGroup({ groupId: group.id, requirementId, label, imageUrl })
      await saveCertGroupQuestions(group.id, questions.map(draftToQuestion))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this group and its questions?')) return
    setSaving(true)
    try {
      await deleteCertGroup(group.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-plum/10 bg-white shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
          Group {index + 1}
        </h2>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="text-xs text-red-600 hover:text-red-500 px-2 py-1.5 rounded hover:bg-red-500/10"
        >
          Delete group
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-4 mb-5">
        {/* Photo */}
        <div className="flex-shrink-0">
          <p className="text-xs font-medium text-plum/60 mb-1.5">Photo (shown once above the questions)</p>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-24 w-36 object-cover rounded-lg border border-plum/20" />
            ) : (
              <div className="h-24 w-36 rounded-lg border border-dashed border-plum/20 flex items-center justify-center text-xs text-plum/40">
                No photo
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-xs text-emerald-700 hover:text-emerald-800 px-3 py-2 rounded bg-emerald-600/10 hover:bg-emerald-600/15 cursor-pointer text-center">
                {uploading ? 'Uploading…' : imageUrl ? 'Replace photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => { setImageUrl(null); setSaved(false) }}
                  className="block w-full text-xs text-plum/50 hover:text-plum/70"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Label */}
        <div className="flex-1 min-w-52">
          <p className="text-xs font-medium text-plum/60 mb-1.5">
            Label <span className="text-plum/40">(admin-only — usually the plant name; employees never see it)</span>
          </p>
          <input
            type="text"
            value={label}
            onChange={(e) => { setLabel(e.target.value); setSaved(false) }}
            placeholder="e.g. Boxwood"
            className="w-full px-3 py-2.5 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      {/* Questions — shared QuestionEditor in its light variant so it
          matches the cert theme (dark stays the default for HU builders). */}
      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
            light
            onChange={(next) => {
              setQuestions((prev) => prev.map((x, xi) => (xi === i ? next : x)))
              setSaved(false)
            }}
            onRemove={() => {
              setQuestions((prev) => prev.filter((_, xi) => xi !== i))
              setSaved(false)
            }}
            canRemove={questions.length > 1}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={() => setQuestions((prev) => [...prev, defaultQuestion('multiple_choice')])}
          className="px-4 py-2 rounded-lg border border-plum/20 hover:border-plum/40 text-plum/80 text-sm font-medium transition-colors"
        >
          + Add question
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save group'}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved</span>}
      </div>
    </section>
  )
}

// ── Standalone questions ──────────────────────────────────────────────────
// Questions of any type attached directly to the module — each one is its
// own drawable unit alongside the photo groups.

function StandaloneSection({
  requirementId,
  initialQuestions,
}: {
  requirementId: string
  initialQuestions: QuizQuestion[]
}) {
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    initialQuestions.map(questionToDraft)
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      await saveCertStandaloneQuestions(requirementId, questions.map(draftToQuestion))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-plum/10 bg-white shadow-sm p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
          Standalone questions
        </h2>
        <span className="text-xs text-plum/50">
          {questions.length} question{questions.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mb-4 text-xs text-plum/50">
        Any question type, no photo group — each standalone question is its own drawable
        unit in the quiz.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-plum/20 px-4 py-6 text-center">
          <p className="text-sm text-plum/50">No standalone questions yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <QuestionEditor
              key={i}
              q={q}
              index={i}
              light
              onChange={(next) => {
                setQuestions((prev) => prev.map((x, xi) => (xi === i ? next : x)))
                setSaved(false)
              }}
              onRemove={() => {
                setQuestions((prev) => prev.filter((_, xi) => xi !== i))
                setSaved(false)
              }}
              canRemove
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setQuestions((prev) => [...prev, defaultQuestion('multiple_choice')])
            setSaved(false)
          }}
          className="px-4 py-2 rounded-lg border border-plum/20 hover:border-plum/40 text-plum/80 text-sm font-medium transition-colors"
        >
          + Add question
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save standalone questions'}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved</span>}
      </div>
    </section>
  )
}

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
  const [groups, setGroups] = useState(initialGroups)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddGroup() {
    setCreating(true)
    setError(null)
    try {
      const { id } = await saveCertGroup({ requirementId, label: '', imageUrl: null })
      setGroups((prev) => [...prev, { id, label: '', imageUrl: null, questions: [] }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add group')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <StandaloneSection requirementId={requirementId} initialQuestions={initialStandalone} />

      <div className="pt-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
          Photo groups
        </h2>
        <p className="mt-1 text-xs text-plum/50">
          One shared photo with linked questions beneath it (the Plant ID format). The whole
          group is one drawable unit; each linked question is still scored separately.
        </p>
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-plum/10 px-4 py-8 text-center">
          <p className="text-sm text-plum/50">
            No question groups yet. Each group is one photo with its linked questions — add
            your first below.
          </p>
        </div>
      )}

      {groups.map((g, i) => (
        <GroupCard
          key={g.id}
          group={g}
          index={i}
          requirementId={requirementId}
          onDeleted={() => {
            setGroups((prev) => prev.filter((x) => x.id !== g.id))
            router.refresh()
          }}
        />
      ))}

      <button
        type="button"
        onClick={handleAddGroup}
        disabled={creating}
        className="w-full px-4 py-3 rounded-xl border border-dashed border-plum/20 hover:border-emerald-600 text-sm font-medium text-plum/70 hover:text-emerald-700 transition-colors disabled:opacity-60"
      >
        {creating ? 'Adding…' : '+ Add question group'}
      </button>
    </div>
  )
}
