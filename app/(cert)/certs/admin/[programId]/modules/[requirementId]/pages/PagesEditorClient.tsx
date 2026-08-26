'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addCertPage,
  updateCertTextPage,
  deleteCertPage,
  reorderCertPages,
  setCertPageCategory,
} from '@/app/cert-admin-actions'
import RichTextEditor from '../../../../RichTextEditor'
import CategoryManagerClient, { type EditorCategory } from '../CategoryManagerClient'
import PlantPageForm from './PlantPageForm'
import type { PlantData } from '@/lib/types'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Pages editor for a lesson module: dnd reorder, add video/text pages,
// inline rich-text editing with an optional positioned image. Pages can be
// grouped into module categories — display only. The learner order stays
// the single flat cert_pages.sort_order: this editor keeps the pages array
// in canonical order (uncategorized first, then each category in category
// order) and rewrites the full flat order on every grouping change, so the
// visual grouping and the gated learner order can never disagree.

export type AdminPage = {
  id: string
  kind: 'video' | 'text' | 'plant'
  videoId: string | null
  videoTitle: string | null
  title: string
  body: string
  imageUrl: string | null
  imagePosition: 'top' | 'bottom' | 'left' | 'right'
  categoryId: string | null
  plantData: PlantData | null
}

// Stable re-sort into canonical flat order; a page whose category no longer
// exists falls back into the uncategorized bucket.
function flattenPages(pages: AdminPage[], categories: EditorCategory[]): AdminPage[] {
  const bucketOf = (p: AdminPage) => {
    if (!p.categoryId) return 0
    const idx = categories.findIndex((c) => c.id === p.categoryId)
    return idx === -1 ? 0 : idx + 1
  }
  return pages
    .map((p, i) => ({ p, i }))
    .sort((a, b) => bucketOf(a.p) - bucketOf(b.p) || a.i - b.i)
    .map(({ p }) => p)
}

export type PickerVideo = { id: string; title: string; thumbnail_url: string | null }

async function uploadCertImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('prefix', 'cert-images')
  const res = await fetch('/api/upload-thumbnail', { method: 'POST', body: fd })
  const json = await res.json()
  if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
  return json.url
}

const POSITION_LABEL: Record<AdminPage['imagePosition'], string> = {
  top: 'Above the text',
  bottom: 'Below the text',
  left: 'Left of the text',
  right: 'Right of the text',
}

function PageRow({
  page,
  position,
  categories,
  onSetCategory,
  onRemove,
  onSaved,
}: {
  page: AdminPage
  position: number
  categories: EditorCategory[]
  onSetCategory: (categoryId: string | null) => void
  onRemove: () => void
  onSaved: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })

  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(page.title)
  const [body, setBody] = useState(page.body)
  const [imageUrl, setImageUrl] = useState(page.imageUrl)
  const [imagePosition, setImagePosition] = useState(page.imagePosition)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      setImageUrl(await uploadCertImage(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateCertTextPage(page.id, { title, body, imageUrl, imagePosition })
      setExpanded(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="rounded-2xl border border-plum/10 bg-white shadow-sm"
    >
      <div className="flex items-center gap-3 p-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-plum/40 hover:text-plum/60 px-1 touch-none select-none"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
          </svg>
        </div>
        <span className="flex-shrink-0 w-6 text-sm font-semibold text-plum/50 text-center">{position}</span>
        <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider bg-plum/10 text-plum/60 px-2 py-0.5 rounded-full">
          {page.kind === 'video' ? 'Video' : page.kind === 'plant' ? 'Plant' : 'Text'}
        </span>
        <p className="flex-1 min-w-0 text-sm font-medium text-plum truncate">
          {page.kind === 'video' ? page.videoTitle : title || 'Untitled page'}
        </p>
        {categories.length > 0 && (
          <select
            value={page.categoryId ?? ''}
            onChange={(e) => onSetCategory(e.target.value || null)}
            title="Category (organizes the lesson into sections)"
            className="flex-shrink-0 max-w-32 rounded-lg border border-plum/20 bg-white px-2 py-1.5 text-xs text-plum/70 focus:outline-none focus:border-emerald-600"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {(page.kind === 'text' || page.kind === 'plant') && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-xs text-plum/60 hover:text-plum px-2 py-1.5 rounded hover:bg-plum/5"
          >
            {expanded ? 'Close' : 'Edit'}
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 text-xs text-red-600 hover:text-red-500 px-2 py-1.5 rounded hover:bg-red-500/10"
        >
          Remove
        </button>
      </div>

      {expanded && page.kind === 'text' && (
        <div className="border-t border-plum/10 p-4 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-plum/60 mb-1">Page title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. How we prune hydrangeas"
              className="w-full px-3 py-2 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-plum/60 mb-1">Page content</label>
            <RichTextEditor initialHtml={body} onChange={setBody} />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-plum/60 mb-1">Photo (optional)</label>
              <div className="flex items-center gap-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-16 w-24 object-cover rounded-lg border border-plum/20" />
                ) : (
                  <div className="h-16 w-24 rounded-lg border border-dashed border-plum/25 flex items-center justify-center text-[11px] text-plum/40">
                    No photo
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-xs text-emerald-700 hover:text-emerald-800 px-3 py-1.5 rounded bg-emerald-600/10 hover:bg-emerald-600/15 cursor-pointer text-center">
                    {uploading ? 'Uploading…' : imageUrl ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
                  </label>
                  {imageUrl && (
                    <button type="button" onClick={() => setImageUrl(null)} className="block w-full text-xs text-plum/50 hover:text-plum/70">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            {imageUrl && (
              <div>
                <label className="block text-xs font-medium text-plum/60 mb-1">Photo position</label>
                <select
                  value={imagePosition}
                  onChange={(e) => setImagePosition(e.target.value as AdminPage['imagePosition'])}
                  className="rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum focus:outline-none focus:border-emerald-600"
                >
                  {(Object.keys(POSITION_LABEL) as AdminPage['imagePosition'][]).map((p) => (
                    <option key={p} value={p}>{POSITION_LABEL[p]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save page'}
          </button>
        </div>
      )}

      {expanded && page.kind === 'plant' && (
        <div className="border-t border-plum/10 p-4">
          <PlantPageForm
            pageId={page.id}
            initial={page.plantData}
            onSaved={(name) => {
              setTitle(name)
              onSaved()
            }}
          />
        </div>
      )}
    </div>
  )
}

export default function PagesEditorClient({
  requirementId,
  initialPages,
  allVideos,
  initialCategories,
}: {
  requirementId: string
  initialPages: AdminPage[]
  allVideos: PickerVideo[]
  initialCategories: EditorCategory[]
}) {
  const router = useRouter()
  const [categories, setCategories] = useState(initialCategories)
  const [pages, setPages] = useState(() => flattenPages(initialPages, initialCategories))
  const [videoSearch, setVideoSearch] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [plantName, setPlantName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const matches = allVideos.filter((v) =>
    v.title.toLowerCase().includes(videoSearch.toLowerCase())
  )

  // addCertPage appends at the global end; re-flatten moves the new
  // (uncategorized) page into its bucket and persists the matching flat
  // order so the DB never disagrees with the visual grouping.
  async function appendPage(page: AdminPage) {
    const next = flattenPages([...pages, page], categories)
    setPages(next)
    if (categories.length > 0) {
      await reorderCertPages(requirementId, next.map((p) => p.id))
    }
  }

  async function handleAddVideo(video: PickerVideo) {
    setAdding(true)
    setError(null)
    try {
      const { id } = await addCertPage(requirementId, { kind: 'video', videoId: video.id })
      await appendPage({ id, kind: 'video', videoId: video.id, videoTitle: video.title, title: '', body: '', imageUrl: null, imagePosition: 'top', categoryId: null, plantData: null })
      setVideoSearch('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleAddText() {
    const title = textTitle.trim()
    if (!title) { setError('Enter a page title first'); return }
    setAdding(true)
    setError(null)
    try {
      const { id } = await addCertPage(requirementId, { kind: 'text', title })
      await appendPage({ id, kind: 'text', videoId: null, videoTitle: null, title, body: '', imageUrl: null, imagePosition: 'top', categoryId: null, plantData: null })
      setTextTitle('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleAddPlant() {
    const name = plantName.trim()
    if (!name) { setError('Enter a plant name first'); return }
    setAdding(true)
    setError(null)
    try {
      const { id } = await addCertPage(requirementId, { kind: 'plant', commonName: name })
      await appendPage({ id, kind: 'plant', videoId: null, videoTitle: null, title: name, body: '', imageUrl: null, imagePosition: 'top', categoryId: null, plantData: { common_name: name } })
      setPlantName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this page? Employee progress on it is deleted too.')) return
    const prev = pages
    setPages((p) => p.filter((x) => x.id !== id))
    try {
      await deleteCertPage(id)
      router.refresh()
    } catch (err) {
      setPages(prev)
      setError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  // Works unchanged with per-category sections: each section's DndContext
  // only drags within its own bucket, and buckets are contiguous slices of
  // the canonical array, so arrayMove on the full array stays in-bucket.
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pages.findIndex((p) => p.id === active.id)
    const newIndex = pages.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(pages, oldIndex, newIndex)
    setPages(next)
    try {
      await reorderCertPages(requirementId, next.map((p) => p.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed — refresh and try again')
    }
  }

  // Move a page to another category: persist the assignment, then rewrite
  // the flat order to match the new grouping. Optimistic with rollback.
  async function handleSetCategory(pageId: string, categoryId: string | null) {
    const prev = pages
    const next = flattenPages(
      pages.map((p) => (p.id === pageId ? { ...p, categoryId } : p)),
      categories
    )
    setPages(next)
    setError(null)
    try {
      await setCertPageCategory(pageId, categoryId)
      await reorderCertPages(requirementId, next.map((p) => p.id))
      router.refresh()
    } catch (err) {
      setPages(prev)
      setError(err instanceof Error ? err.message : 'Category change failed')
    }
  }

  // Category list changes from the manager. On delete, mirror the DB's
  // ON DELETE SET NULL locally; after reorder/delete, persist the re-bucketed
  // flat order so grouping and learner order stay in lockstep.
  async function handleCategoriesChange(next: EditorCategory[]) {
    const valid = new Set(next.map((c) => c.id))
    const nextPages = flattenPages(
      pages.map((p) => (p.categoryId && !valid.has(p.categoryId) ? { ...p, categoryId: null } : p)),
      next
    )
    setCategories(next)
    setPages(nextPages)
    if (nextPages.some((p, i) => p.id !== pages[i]?.id)) {
      try {
        await reorderCertPages(requirementId, nextPages.map((p) => p.id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reorder failed — refresh and try again')
      }
    }
  }

  // Contiguous buckets of the canonical array, in display order. Sections
  // render only when categories exist; empty buckets are skipped.
  const buckets: { categoryId: string | null; name: string; startIndex: number; pages: AdminPage[] }[] = []
  if (categories.length > 0) {
    for (const b of [null, ...categories.map((c) => c.id)]) {
      const name = b === null ? 'Uncategorized' : categories.find((c) => c.id === b)!.name
      const bucketPages = pages.filter((p) =>
        b === null
          ? !p.categoryId || !categories.some((c) => c.id === p.categoryId)
          : p.categoryId === b
      )
      if (bucketPages.length > 0) {
        buckets.push({ categoryId: b, name, startIndex: pages.indexOf(bucketPages[0]), pages: bucketPages })
      }
    }
  }

  return (
    <div className="space-y-5">
      <CategoryManagerClient
        requirementId={requirementId}
        categories={categories}
        onChange={handleCategoriesChange}
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-plum/20 px-4 py-8 text-center">
          <p className="text-sm text-plum/50">
            No pages yet. Add videos from the library or rich-text pages below — employees
            will work through them in order.
          </p>
        </div>
      ) : categories.length === 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {pages.map((p, i) => (
                <PageRow
                  key={p.id}
                  page={p}
                  position={i + 1}
                  categories={categories}
                  onSetCategory={(categoryId) => handleSetCategory(p.id, categoryId)}
                  onRemove={() => handleRemove(p.id)}
                  onSaved={() => router.refresh()}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        // One section per non-empty bucket, each its own drag context —
        // pages reorder within their section; the dropdown moves them across.
        <div className="space-y-4">
          {buckets.map((bucket) => (
            <div key={bucket.categoryId ?? 'uncategorized'} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
                {bucket.name}
              </p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={bucket.pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {bucket.pages.map((p, i) => (
                      <PageRow
                        key={p.id}
                        page={p}
                        position={bucket.startIndex + i + 1}
                        categories={categories}
                        onSetCategory={(categoryId) => handleSetCategory(p.id, categoryId)}
                        onRemove={() => handleRemove(p.id)}
                        onSaved={() => router.refresh()}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))}
        </div>
      )}

      {/* Add pages */}
      <section className="rounded-2xl border border-plum/10 bg-white shadow-sm p-4 sm:p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50 mb-2">
            Add a video page
          </p>
          <input
            type="text"
            value={videoSearch}
            onChange={(e) => setVideoSearch(e.target.value)}
            placeholder="Search the video library…"
            className="w-full px-3 py-2.5 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600 mb-2"
          />
          {videoSearch.trim() !== '' && (
            matches.length > 0 ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {matches.slice(0, 20).map((v) => (
                  <div key={v.id} className="flex items-center gap-3 bg-plum/5 rounded-lg p-2.5">
                    <div className="w-14 h-8 rounded bg-plum/10 flex-shrink-0 overflow-hidden">
                      {v.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <p className="flex-1 text-sm text-plum/80 truncate">{v.title}</p>
                    <button
                      type="button"
                      onClick={() => handleAddVideo(v)}
                      disabled={adding}
                      className="text-xs text-emerald-700 hover:text-emerald-800 px-3 py-1.5 rounded bg-emerald-600/10 hover:bg-emerald-600/15 flex-shrink-0 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-plum/50">No videos match your search.</p>
            )
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50 mb-2">
            Add a text page
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Page title, e.g. Reading a plant tag"
              className="flex-1 px-3 py-2.5 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={handleAddText}
              disabled={adding}
              className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex-shrink-0"
            >
              Add page
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50 mb-2">
            Add a plant page
          </p>
          <p className="text-xs text-plum/40 mb-2">
            A structured plant reference — ID marks, quick facts, trim steps, tips, and common
            mistakes. Completes on mark-as-read like a text page.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={plantName}
              onChange={(e) => setPlantName(e.target.value)}
              placeholder="Plant name, e.g. Arborvitae"
              className="flex-1 px-3 py-2.5 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={handleAddPlant}
              disabled={adding}
              className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex-shrink-0"
            >
              Add plant
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
