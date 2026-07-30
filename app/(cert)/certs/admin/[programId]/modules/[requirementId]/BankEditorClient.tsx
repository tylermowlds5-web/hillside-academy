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
import { saveCertGroup, deleteCertGroup, saveCertGroupQuestions } from '@/app/cert-admin-actions'

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
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
          Group {index + 1}
        </h2>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="text-xs text-red-500 hover:text-red-400 px-2 py-1.5 rounded hover:bg-red-500/10"
        >
          Delete group
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-950 border border-red-800 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-4 mb-5">
        {/* Photo */}
        <div className="flex-shrink-0">
          <p className="text-xs font-medium text-zinc-400 mb-1.5">Photo (shown once above the questions)</p>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-24 w-36 object-cover rounded-lg border border-zinc-700" />
            ) : (
              <div className="h-24 w-36 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-xs text-zinc-600">
                No photo
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-xs text-emerald-400 hover:text-emerald-300 px-3 py-2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer text-center">
                {uploading ? 'Uploading…' : imageUrl ? 'Replace photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => { setImageUrl(null); setSaved(false) }}
                  className="block w-full text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Label */}
        <div className="flex-1 min-w-52">
          <p className="text-xs font-medium text-zinc-400 mb-1.5">
            Label <span className="text-zinc-600">(admin-only — usually the plant name; employees never see it)</span>
          </p>
          <input
            type="text"
            value={label}
            onChange={(e) => { setLabel(e.target.value); setSaved(false) }}
            placeholder="e.g. Boxwood"
            className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            q={q}
            index={i}
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
          className="px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-200 text-sm font-medium transition-colors"
        >
          + Add question
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save group'}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
      </div>
    </section>
  )
}

export default function BankEditorClient({
  requirementId,
  initialGroups,
}: {
  requirementId: string
  initialGroups: BankGroup[]
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
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
          <p className="text-sm text-zinc-500">
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
        className="w-full px-4 py-3 rounded-xl border border-dashed border-zinc-700 hover:border-emerald-600 text-sm font-medium text-zinc-300 hover:text-emerald-400 transition-colors disabled:opacity-60"
      >
        {creating ? 'Adding…' : '+ Add question group'}
      </button>
    </div>
  )
}
