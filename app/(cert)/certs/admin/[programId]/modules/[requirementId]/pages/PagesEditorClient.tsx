'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addCertPage,
  updateCertTextPage,
  deleteCertPage,
  reorderCertPages,
} from '@/app/cert-admin-actions'
import RichTextEditor from '../../../../RichTextEditor'
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
// inline rich-text editing with an optional positioned image.

export type AdminPage = {
  id: string
  kind: 'video' | 'text'
  videoId: string | null
  videoTitle: string | null
  title: string
  body: string
  imageUrl: string | null
  imagePosition: 'top' | 'bottom' | 'left' | 'right'
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
  onRemove,
  onSaved,
}: {
  page: AdminPage
  position: number
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
          {page.kind === 'video' ? 'Video' : 'Text'}
        </span>
        <p className="flex-1 min-w-0 text-sm font-medium text-plum truncate">
          {page.kind === 'video' ? page.videoTitle : title || 'Untitled page'}
        </p>
        {page.kind === 'text' && (
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
    </div>
  )
}

export default function PagesEditorClient({
  requirementId,
  initialPages,
  allVideos,
}: {
  requirementId: string
  initialPages: AdminPage[]
  allVideos: PickerVideo[]
}) {
  const router = useRouter()
  const [pages, setPages] = useState(initialPages)
  const [videoSearch, setVideoSearch] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const matches = allVideos.filter((v) =>
    v.title.toLowerCase().includes(videoSearch.toLowerCase())
  )

  async function handleAddVideo(video: PickerVideo) {
    setAdding(true)
    setError(null)
    try {
      const { id } = await addCertPage(requirementId, { kind: 'video', videoId: video.id })
      setPages((prev) => [
        ...prev,
        { id, kind: 'video', videoId: video.id, videoTitle: video.title, title: '', body: '', imageUrl: null, imagePosition: 'top' },
      ])
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
      setPages((prev) => [
        ...prev,
        { id, kind: 'text', videoId: null, videoTitle: null, title, body: '', imageUrl: null, imagePosition: 'top' },
      ])
      setTextTitle('')
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

  return (
    <div className="space-y-5">
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
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {pages.map((p, i) => (
                <PageRow
                  key={p.id}
                  page={p}
                  position={i + 1}
                  onRemove={() => handleRemove(p.id)}
                  onSaved={() => router.refresh()}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
      </section>
    </div>
  )
}
