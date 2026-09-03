'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addCertPage,
  deleteCertPage,
  markCertPageReviewed,
  reorderCertPages,
  setCertPageCategory,
} from '@/app/cert-admin-actions'
import BulkPlantImport from '../../../BulkPlantImport'
import CategoryManagerClient, { type EditorCategory } from '../CategoryManagerClient'
import PlantPageForm from './PlantPageForm'
import PageBlocksEditor from './PageBlocksEditor'
import type { PageBlock, PlantData } from '@/lib/types'
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
  blocks: PageBlock[] | null
  // Draft flag: hidden from employees until reviewed (bulk imports start
  // flagged; saving the plant form or "Mark reviewed" clears it).
  needsReview: boolean
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

function PageRow({
  page,
  position,
  categories,
  onSetCategory,
  onRemove,
  onMarkReviewed,
  onTextSaved,
  onPlantSaved,
}: {
  page: AdminPage
  position: number
  categories: EditorCategory[]
  onSetCategory: (categoryId: string | null) => void
  onRemove: () => void
  onMarkReviewed: () => void
  // Saves must patch the parent's pages state (not just refresh): the
  // editors remount from that state on reopen.
  onTextSaved: (title: string, blocks: PageBlock[]) => void
  onPlantSaved: (commonName: string, data: PlantData) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })

  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(page.title)

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
        {page.needsReview && (
          <>
            <span
              className="flex-shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700"
              title="Hidden from employees until reviewed"
            >
              Needs review
            </span>
            <button
              type="button"
              onClick={onMarkReviewed}
              title="Looked at it, no changes needed — publish to employees"
              className="flex-shrink-0 text-xs text-emerald-700 hover:text-emerald-800 px-2.5 py-1.5 rounded bg-emerald-600/10 hover:bg-emerald-600/15"
            >
              Mark reviewed
            </button>
          </>
        )}
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
        <div className="border-t border-plum/10 p-4">
          <PageBlocksEditor
            pageId={page.id}
            initialTitle={title}
            legacyBody={page.body}
            legacyImageUrl={page.imageUrl}
            initialBlocks={page.blocks}
            onSaved={(newTitle, blocks) => {
              setTitle(newTitle)
              onTextSaved(newTitle, blocks)
            }}
            onClose={() => setExpanded(false)}
          />
        </div>
      )}

      {expanded && page.kind === 'plant' && (
        <div className="border-t border-plum/10 p-4">
          <PlantPageForm
            pageId={page.id}
            initial={page.plantData}
            needsReview={page.needsReview}
            onSaved={(name, data) => {
              setTitle(name)
              onPlantSaved(name, data)
            }}
            onClose={() => setExpanded(false)}
          />
        </div>
      )}
    </div>
  )
}

export default function PagesEditorClient({
  requirementId,
  lessonTitle,
  initialPages,
  allVideos,
  initialCategories,
}: {
  requirementId: string
  lessonTitle: string
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
  // Review filter: show only flagged (needs_review) pages.
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const reviewCount = pages.filter((p) => p.needsReview).length
  const showFlaggedOnly = flaggedOnly && reviewCount > 0
  const visiblePages = showFlaggedOnly ? pages.filter((p) => p.needsReview) : pages

  // "Mark reviewed": publish a draft as-is. Optimistic with rollback.
  async function handleMarkReviewed(pageId: string) {
    const prev = pages
    setPages((p) => p.map((x) => (x.id === pageId ? { ...x, needsReview: false } : x)))
    setError(null)
    try {
      await markCertPageReviewed(pageId)
      router.refresh()
    } catch (err) {
      setPages(prev)
      setError(err instanceof Error ? err.message : 'Could not mark reviewed')
    }
  }

  // Bulk import appended rows at the global end (all flagged); mirror them
  // locally and re-bucket like appendPage does.
  async function handleBulkImported(_reqId: string, ids: string[], plants: PlantData[]) {
    const added: AdminPage[] = ids.map((id, i) => ({
      id,
      kind: 'plant',
      videoId: null,
      videoTitle: null,
      title: plants[i]?.common_name ?? 'Plant',
      body: '',
      imageUrl: null,
      imagePosition: 'top',
      categoryId: null,
      plantData: plants[i] ?? null,
      blocks: null,
      needsReview: true,
    }))
    const next = flattenPages([...pages, ...added], categories)
    setPages(next)
    setError(null)
    try {
      if (categories.length > 0) await reorderCertPages(requirementId, next.map((p) => p.id))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed — refresh and try again')
    }
  }

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
      await appendPage({ id, kind: 'video', videoId: video.id, videoTitle: video.title, title: '', body: '', imageUrl: null, imagePosition: 'top', categoryId: null, plantData: null, blocks: null, needsReview: false })
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
      await appendPage({ id, kind: 'text', videoId: null, videoTitle: null, title, body: '', imageUrl: null, imagePosition: 'top', categoryId: null, plantData: null, blocks: null, needsReview: false })
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
      await appendPage({ id, kind: 'plant', videoId: null, videoTitle: null, title: name, body: '', imageUrl: null, imagePosition: 'top', categoryId: null, plantData: { common_name: name }, blocks: null, needsReview: false })
      setPlantName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  // Patch local pages state with saved payloads — the editors remount from
  // this state on reopen, so a refresh alone leaves them stale.
  function handlePlantSaved(pageId: string, name: string, data: PlantData) {
    // Saving the plant form is the review — the server clears the flag too.
    setPages((prev) => prev.map((x) => (x.id === pageId ? { ...x, title: name, plantData: data, needsReview: false } : x)))
    router.refresh()
  }

  function handleTextSaved(pageId: string, title: string, blocks: PageBlock[]) {
    setPages((prev) => prev.map((x) => (x.id === pageId ? { ...x, title, blocks } : x)))
    router.refresh()
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
  // Buckets come from the visible (possibly filtered) list; positions always
  // reflect the full learner order.
  const buckets: { categoryId: string | null; name: string; pages: AdminPage[] }[] = []
  if (categories.length > 0) {
    for (const b of [null, ...categories.map((c) => c.id)]) {
      const name = b === null ? 'Uncategorized' : categories.find((c) => c.id === b)!.name
      const bucketPages = visiblePages.filter((p) =>
        b === null
          ? !p.categoryId || !categories.some((c) => c.id === p.categoryId)
          : p.categoryId === b
      )
      if (bucketPages.length > 0) {
        buckets.push({ categoryId: b, name, pages: bucketPages })
      }
    }
  }

  const rowFor = (p: AdminPage) => (
    <PageRow
      key={p.id}
      page={p}
      position={pages.indexOf(p) + 1}
      categories={categories}
      onSetCategory={(categoryId) => handleSetCategory(p.id, categoryId)}
      onRemove={() => handleRemove(p.id)}
      onMarkReviewed={() => handleMarkReviewed(p.id)}
      onTextSaved={(title, blocks) => handleTextSaved(p.id, title, blocks)}
      onPlantSaved={(name, data) => handlePlantSaved(p.id, name, data)}
    />
  )

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

      {/* Review status: count of flagged drafts + filter toggle */}
      {pages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-plum/50">
            {pages.length} page{pages.length === 1 ? '' : 's'}
          </span>
          {reviewCount > 0 ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {reviewCount} need{reviewCount === 1 ? 's' : ''} review
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-plum/70">
                <input
                  type="checkbox"
                  checked={showFlaggedOnly}
                  onChange={(e) => setFlaggedOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                Show only pages needing review
              </label>
            </>
          ) : (
            <span className="text-xs text-emerald-700">All pages reviewed</span>
          )}
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
          <SortableContext items={visiblePages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">{visiblePages.map(rowFor)}</div>
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
                  <div className="space-y-2">{bucket.pages.map(rowFor)}</div>
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">
              Add a plant page
            </p>
            <BulkPlantImport
              lessons={[{ id: requirementId, title: lessonTitle }]}
              defaultLessonId={requirementId}
              lockLesson
              onImported={handleBulkImported}
            />
          </div>
          <p className="text-xs text-plum/40 mb-2">
            A structured plant reference — ID marks, quick facts, trim steps, tips, and common
            mistakes. Completes on mark-as-read like a text page. Bulk import creates many at
            once from JSON, flagged for review until you check them.
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
