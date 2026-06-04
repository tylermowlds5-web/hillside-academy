'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Category, StandaloneQuiz } from '@/lib/types'
import { saveStandaloneQuiz, type QuizPayload } from '@/app/actions'
import QuizBuilder from '../videos/[videoId]/quiz/QuizBuilder'

// Create / edit modal for a standalone quiz. Holds the metadata (title,
// description, category) in local state and forwards the question payload
// from the embedded QuizBuilder into saveStandaloneQuiz on save.

export default function QuizModal({
  existing,
  categories,
  onClose,
}: {
  existing: StandaloneQuiz | null
  categories: Category[]
  onClose: () => void
}) {
  const router = useRouter()
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? '')

  async function handleSave(payload: QuizPayload) {
    if (!title.trim()) throw new Error('Title is required')
    await saveStandaloneQuiz({
      id: existing?.id ?? null,
      title: title.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      passing_score: payload.passing_score,
      questions: payload.questions,
    })
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-base font-semibold text-zinc-50">
            {existing ? 'Edit Quiz' : 'Add Quiz'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Metadata */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Safety Procedures Refresher"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional context shown to employees"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Questions — reuses the same builder as video quizzes. Its Save
              button is the modal's save: it calls our handleSave which mixes
              the metadata above with the question payload. */}
          <div className="pt-2 border-t border-zinc-800">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Questions</p>
            <QuizBuilder
              existing={existing ? { passing_score: existing.passing_score, questions: existing.questions } : null}
              onSave={handleSave}
              saveLabel="Create Quiz"
              updateLabel="Save Changes"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
