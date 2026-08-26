'use client'

import { useState } from 'react'
import {
  createCertCategory,
  renameCertCategory,
  reorderCertCategories,
  deleteCertCategory,
} from '@/app/cert-admin-actions'

// ── Module category manager ───────────────────────────────────────────────
// Create/rename/reorder/delete the sub-categories of ONE module, shared by
// the pages editor and the question-bank editor. Category state is OWNED BY
// THE HOST editor (passed in + onChange) so its assignment dropdowns update
// immediately and survive router.refresh(). Categories organize content
// only — the quiz still draws randomly from the whole bank, and category
// names are never shown on quiz questions.

export type EditorCategory = { id: string; name: string }

export default function CategoryManagerClient({
  requirementId,
  categories,
  onChange,
}: {
  requirementId: string
  categories: EditorCategory[]
  onChange: (next: EditorCategory[]) => void
}) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    run(async () => {
      const { id } = await createCertCategory(requirementId, name)
      onChange([...categories, { id, name }])
      setNewName('')
    })
  }

  function handleRename(id: string, name: string) {
    const trimmed = name.trim()
    const current = categories.find((c) => c.id === id)
    if (!current || !trimmed || trimmed === current.name) return
    run(async () => {
      await renameCertCategory(id, trimmed)
      onChange(categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)))
    })
  }

  function handleMove(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= categories.length) return
    const next = [...categories]
    ;[next[index], next[target]] = [next[target], next[index]]
    run(async () => {
      await reorderCertCategories(requirementId, next.map((c) => c.id))
      onChange(next)
    })
  }

  function handleDelete(id: string) {
    if (
      !confirm(
        'Delete this category? Its pages and questions become uncategorized — nothing is deleted.'
      )
    )
      return
    run(async () => {
      await deleteCertCategory(id)
      onChange(categories.filter((c) => c.id !== id))
    })
  }

  return (
    <section className="rounded-2xl border border-plum/10 bg-white shadow-sm p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">Categories</p>
      <p className="mt-1 mb-3 text-xs text-plum/40">
        Categories organize this module&apos;s pages and questions. The quiz still draws randomly
        from the whole bank, and category names are never shown on quiz questions.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {categories.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {categories.map((cat, i) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              busy={busy}
              canMoveUp={i > 0}
              canMoveDown={i < categories.length - 1}
              onRename={(name) => handleRename(cat.id, name)}
              onMoveUp={() => handleMove(i, -1)}
              onMoveDown={() => handleMove(i, 1)}
              onDelete={() => handleDelete(cat.id)}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="New category, e.g. Evergreens"
          className="flex-1 px-3 py-2 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !newName.trim()}
          className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex-shrink-0"
        >
          Add
        </button>
      </div>
    </section>
  )
}

function CategoryRow({
  category,
  busy,
  canMoveUp,
  canMoveDown,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  category: EditorCategory
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onRename: (name: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(category.name)

  return (
    <div className="flex items-center gap-2 rounded-lg bg-plum/5 p-2">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={busy || !canMoveUp}
          title="Move up"
          className="px-1 text-plum/40 hover:text-plum/70 disabled:opacity-30 leading-none"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={busy || !canMoveDown}
          title="Move down"
          className="px-1 text-plum/40 hover:text-plum/70 disabled:opacity-30 leading-none"
        >
          ▼
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => (name.trim() ? onRename(name) : setName(category.name))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white border border-plum/20 text-plum text-sm focus:outline-none focus:border-emerald-600"
      />
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="flex-shrink-0 text-xs text-red-600 hover:text-red-500 px-2 py-1.5 rounded hover:bg-red-500/10 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  )
}
