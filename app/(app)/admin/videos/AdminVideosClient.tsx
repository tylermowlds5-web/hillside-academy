'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Video, Category, SubCategory } from '@/lib/types'
import VideoForm from './VideoForm'
import EditVideoPanel from './EditVideoPanel'
import {
  deleteVideo,
  reorderVideos,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
} from '@/app/actions'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Icons ─────────────────────────────────────────────────────────────────

function DragHandle(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 px-1 touch-none select-none" title="Drag to reorder">
      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
        <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
        <circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" />
        <circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
      </svg>
    </div>
  )
}

function IconEdit({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>
  )
}

function IconTrash({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

// ── Sortable video row ────────────────────────────────────────────────────

function SortableVideoRow({
  video,
  onDeleted,
  onEdit,
  isDragOverlay = false,
}: {
  video: Video
  onDeleted: () => void
  onEdit: (video: Video) => void
  isDragOverlay?: boolean
}) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: video.id })
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this video? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteVideo(video.id)
      onDeleted()
      router.refresh()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
      className={`flex items-start gap-3 bg-zinc-900 border rounded-xl p-4 transition-colors ${isDragOverlay ? 'border-emerald-500 shadow-xl shadow-black/40' : 'border-zinc-800 hover:border-zinc-700'}`}
    >
      <DragHandle {...attributes} {...listeners} />

      {/* Thumbnail */}
      <div className="w-20 h-12 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-zinc-100 truncate">{video.title}</h3>
        {video.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{video.description}</p>}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-zinc-600 truncate max-w-[200px]" title={video.url}>
            {video.url.replace(/^https?:\/\//, '')}
          </span>
          {video.duration && <span className="text-xs text-zinc-600 flex-shrink-0">{formatDuration(video.duration)}</span>}
        </div>
      </div>

      {/* Actions */}
      {!isDragOverlay && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Link href={`/watch/${video.id}`} className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800">Preview</Link>
          <Link href={`/admin/videos/${video.id}/quiz`} className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800">Quiz</Link>
          <button type="button" onClick={() => onEdit(video)} className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800">Edit</button>
          <button type="button" onClick={handleDelete} disabled={deleting} className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10 disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Section (sub-category or direct videos) ───────────────────────────────

function Section({
  sectionKey,
  label,
  videos,
  isDropTarget,
  onDrillDown,
  onVideoDeleted,
  onVideoEdit,
  onRename,
  onDelete,
}: {
  sectionKey: string
  label: string
  videos: Video[]
  isDropTarget: boolean
  onDrillDown: (key: string) => void
  onVideoDeleted: () => void
  onVideoEdit: (v: Video) => void
  onRename?: () => void
  onDelete?: () => void
}) {
  return (
    <div className={`rounded-xl border transition-colors ${isDropTarget ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-zinc-800'}`}>
      <div className="flex items-center justify-between px-4 py-3 rounded-t-xl hover:bg-zinc-800/30">
        <button className="flex items-center gap-2 flex-1 min-w-0 text-left" onClick={() => onDrillDown(sectionKey)}>
          {sectionKey !== '' && (
            <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          )}
          <span className="text-sm font-medium text-zinc-200 truncate">{label}</span>
          <span className="text-xs text-zinc-600 flex-shrink-0">({videos.length})</span>
          <svg className="w-4 h-4 text-zinc-600 flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        {(onRename || onDelete) && (
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            {onRename && (
              <button onClick={onRename} className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Rename">
                <IconEdit className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete sub category">
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-3 pt-0 space-y-2 min-h-[2rem]">
        <SortableContext items={videos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
          {videos.map((v) => (
            <SortableVideoRow key={v.id} video={v} onDeleted={onVideoDeleted} onEdit={onVideoEdit} />
          ))}
        </SortableContext>
        {videos.length === 0 && (
          <div className={`py-4 text-center text-xs ${isDropTarget ? 'text-emerald-500/70' : 'text-zinc-600'}`}>
            {isDropTarget ? 'Drop here to move' : 'No videos — drag one here'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline rename modal ───────────────────────────────────────────────────

function RenameModal({
  title,
  currentName,
  onSave,
  onClose,
  saving,
}: {
  title: string
  currentName: string
  onSave: (name: string) => void
  onClose: () => void
  saving: boolean
}) {
  const [value, setValue] = useState(currentName)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-50 mb-4">{title}</h2>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && onSave(value.trim())}
          autoFocus
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">Cancel</button>
          <button type="button" disabled={!value.trim() || saving} onClick={() => onSave(value.trim())}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  videos: Video[]
  categories: Category[]
  subCategories: SubCategory[]
}

export default function AdminVideosClient({ videos: initialVideos, categories: initialCategories, subCategories: initialSubCategories }: Props) {
  const router = useRouter()

  // Navigation
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string | null>(null)

  // UI panels / modals
  const [showAddVideo, setShowAddVideo] = useState(false)
  const [videoFormKey, setVideoFormKey] = useState(0)
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)

  // Category modals
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [renamingCategory, setRenamingCategory] = useState<Category | null>(null)
  const [renamingCategorySaving, setRenamingCategorySaving] = useState(false)

  // Sub-category modals
  const [showCreateSubCategory, setShowCreateSubCategory] = useState(false)
  const [newSubCategoryName, setNewSubCategoryName] = useState('')
  const [creatingSubCategory, setCreatingSubCategory] = useState(false)
  const [renamingSubCategory, setRenamingSubCategory] = useState<SubCategory | null>(null)
  const [renamingSubCategorySaving, setRenamingSubCategorySaving] = useState(false)

  // ── DnD state ──────────────────────────────────────────────────────────

  const [sectionItems, setSectionItems] = useState<Record<string, string[]>>({})
  const videoMap = useRef<Map<string, Video>>(new Map())
  const [activeVideo, setActiveVideo] = useState<Video | null>(null)
  const [overSectionKey, setOverSectionKey] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const subCategoryMap = new Map(initialSubCategories.map((sc) => [sc.id, sc]))

  // Rebuild videoMap whenever initialVideos changes
  useEffect(() => {
    const m = new Map<string, Video>()
    for (const v of initialVideos) m.set(v.id, v)
    videoMap.current = m
  }, [initialVideos])

  // Sync sectionItems when category changes or video membership changes
  const lastSyncedCategoryKey = useRef('')
  const lastSyncedVideoIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedCategoryId) return

    const currentIds = new Set(
      initialVideos.filter((v) => v.category_id === selectedCategoryId).map((v) => v.id)
    )

    const categoryChanged = lastSyncedCategoryKey.current !== selectedCategoryId
    const idsChanged =
      currentIds.size !== lastSyncedVideoIds.current.size ||
      [...currentIds].some((id) => !lastSyncedVideoIds.current.has(id))

    if (categoryChanged || idsChanged) {
      lastSyncedCategoryKey.current = selectedCategoryId
      lastSyncedVideoIds.current = currentIds

      const sections: Record<string, string[]> = { '': [] }
      // Add empty sections for all sub_categories in this category
      for (const sc of initialSubCategories) {
        if (sc.category_id === selectedCategoryId) sections[sc.id] = []
      }
      // Fill with videos
      for (const v of initialVideos) {
        if (v.category_id !== selectedCategoryId) continue
        const key = v.sub_category_id ?? ''
        if (!sections[key]) sections[key] = []
        sections[key].push(v.id)
      }
      setSectionItems(sections)
    }
  }, [initialVideos, initialSubCategories, selectedCategoryId])

  // ── Display sections ────────────────────────────────────────────────────

  function getDisplaySections(): Record<string, Video[]> {
    if (!selectedCategoryId) return {}
    const result: Record<string, Video[]> = {}
    for (const [key, ids] of Object.entries(sectionItems)) {
      result[key] = ids.map((id) => videoMap.current.get(id)).filter((v): v is Video => !!v)
    }
    return result
  }

  const displaySections = getDisplaySections()
  const sortedSectionEntries = Object.entries(displaySections).sort(([a], [b]) => {
    if (a === '') return -1
    if (b === '') return 1
    return (subCategoryMap.get(a)?.sort_order ?? 0) - (subCategoryMap.get(b)?.sort_order ?? 0) || a.localeCompare(b)
  })

  const subCatVideos =
    selectedCategoryId && selectedSubCategoryId !== null
      ? (displaySections[selectedSubCategoryId] ?? [])
      : []

  // ── Category actions ────────────────────────────────────────────────────

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    try {
      await createCategory(newCategoryName.trim())
      setShowCreateCategory(false)
      setNewCategoryName('')
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setCreatingCategory(false)
    }
  }

  async function handleRenameCategory(name: string) {
    if (!renamingCategory) return
    setRenamingCategorySaving(true)
    try {
      await updateCategory(renamingCategory.id, name)
      setRenamingCategory(null)
      router.refresh()
    } finally {
      setRenamingCategorySaving(false)
    }
  }

  async function handleDeleteCategory(cat: Category) {
    if (!confirm(`Delete category "${cat.name}"? Its videos will become uncategorized.`)) return
    try {
      await deleteCategory(cat.id)
      if (selectedCategoryId === cat.id) setSelectedCategoryId(null)
      router.refresh()
    } catch (err) {
      console.error(err)
    }
  }

  // ── Sub-category actions ────────────────────────────────────────────────

  async function handleCreateSubCategory() {
    if (!newSubCategoryName.trim() || !selectedCategoryId) return
    setCreatingSubCategory(true)
    try {
      await createSubCategory(selectedCategoryId, newSubCategoryName.trim())
      setShowCreateSubCategory(false)
      setNewSubCategoryName('')
      router.refresh()
    } finally {
      setCreatingSubCategory(false)
    }
  }

  async function handleRenameSubCategory(name: string) {
    if (!renamingSubCategory) return
    setRenamingSubCategorySaving(true)
    try {
      await updateSubCategory(renamingSubCategory.id, name)
      setRenamingSubCategory(null)
      router.refresh()
    } finally {
      setRenamingSubCategorySaving(false)
    }
  }

  async function handleDeleteSubCategory(sc: SubCategory) {
    if (!confirm(`Delete sub category "${sc.name}"? Its videos will move to "Direct Videos".`)) return
    try {
      await deleteSubCategory(sc.id)
      if (selectedSubCategoryId === sc.id) setSelectedSubCategoryId(null)
      router.refresh()
    } catch (err) {
      console.error(err)
    }
  }

  // ── DnD helpers ─────────────────────────────────────────────────────────

  function findSectionForVideo(videoId: string): string | null {
    for (const [key, ids] of Object.entries(sectionItems)) {
      if (ids.includes(videoId)) return key
    }
    return null
  }

  function computeUpdates(sections: Record<string, string[]>) {
    const updates: { id: string; sort_order: number; sub_category_id: string | null; sub_category: string | null }[] = []
    let order = 0
    const keys = Object.keys(sections).sort((a, b) => {
      if (a === '') return -1
      if (b === '') return 1
      return (subCategoryMap.get(a)?.sort_order ?? 0) - (subCategoryMap.get(b)?.sort_order ?? 0)
    })
    for (const key of keys) {
      const subCatId = key === '' ? null : key
      const subCatName = subCatId ? (subCategoryMap.get(subCatId)?.name ?? null) : null
      for (const id of sections[key]) {
        updates.push({ id, sort_order: order++, sub_category_id: subCatId, sub_category: subCatName })
      }
    }
    return updates
  }

  function saveOrder(sections: Record<string, string[]>) {
    const updates = computeUpdates(sections)
    if (updates.length > 0) {
      reorderVideos(updates).catch((err) => console.error('[reorderVideos]', err))
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveVideo(videoMap.current.get(event.active.id as string) ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string
    const activeSection = findSectionForVideo(activeId)
    if (activeSection === null) return
    const isOverSection = overId in sectionItems
    const newOverSection = isOverSection ? overId : findSectionForVideo(overId)
    setOverSectionKey(newOverSection)
    if (newOverSection === null || activeSection === newOverSection) return
    setSectionItems((prev) => ({
      ...prev,
      [activeSection]: (prev[activeSection] ?? []).filter((id) => id !== activeId),
      [newOverSection]: [...(prev[newOverSection] ?? []), activeId],
    }))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveVideo(null)
    setOverSectionKey(null)
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string
    const isOverSection = overId in sectionItems
    if (activeId === overId || isOverSection) { saveOrder(sectionItems); return }
    const activeSection = findSectionForVideo(activeId)
    const overSection = findSectionForVideo(overId)
    if (activeSection === null || overSection === null) { saveOrder(sectionItems); return }
    if (activeSection !== overSection) { saveOrder(sectionItems); return }
    const currentIds = sectionItems[activeSection] ?? []
    const oldIndex = currentIds.indexOf(activeId)
    const newIndex = currentIds.indexOf(overId)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) { saveOrder(sectionItems); return }
    const newIds = arrayMove(currentIds, oldIndex, newIndex)
    const newSections = { ...sectionItems, [activeSection]: newIds }
    setSectionItems(newSections)
    saveOrder(newSections)
  }

  // ── Computed data ───────────────────────────────────────────────────────

  const videoCountByCategory = new Map<string, number>()
  for (const v of initialVideos) {
    if (v.category_id) videoCountByCategory.set(v.category_id, (videoCountByCategory.get(v.category_id) ?? 0) + 1)
  }

  const selectedCat = selectedCategoryId ? initialCategories.find((c) => c.id === selectedCategoryId) : null
  const selectedSubCat = selectedSubCategoryId ? initialSubCategories.find((sc) => sc.id === selectedSubCategoryId) : null
  const showingCategoryLevel = selectedCategoryId !== null && selectedSubCategoryId === null
  const showingSubCatLevel = selectedCategoryId !== null && selectedSubCategoryId !== null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Videos</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage your training video library</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCategoryId === null && (
            <button onClick={() => setShowCreateCategory(true)} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm transition-colors">
              Add Category
            </button>
          )}
          {showingCategoryLevel && (
            <button onClick={() => setShowCreateSubCategory(true)} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm transition-colors">
              Add Sub Category
            </button>
          )}
          <button onClick={() => { setVideoFormKey((k) => k + 1); setShowAddVideo(true) }} className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors">
            Add Video
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {selectedCategoryId !== null && (
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => { setSelectedCategoryId(null); setSelectedSubCategoryId(null) }} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">All Categories</button>
          <span className="text-zinc-700">/</span>
          {selectedSubCategoryId !== null ? (
            <>
              <button onClick={() => setSelectedSubCategoryId(null)} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">{selectedCat?.name}</button>
              <span className="text-zinc-700">/</span>
              <span className="text-sm font-semibold text-zinc-200">{selectedSubCat?.name ?? 'Direct Videos'}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-zinc-200">{selectedCat?.name}</span>
          )}
        </div>
      )}

      {/* ── Level 0: Category cards ── */}
      {selectedCategoryId === null && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Library ({initialCategories.length} {initialCategories.length === 1 ? 'category' : 'categories'})
          </h2>
          {initialCategories.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No categories yet. Click "Add Category" to create one.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {initialCategories.map((cat) => {
                const subCatCount = initialSubCategories.filter((sc) => sc.category_id === cat.id).length
                const videoCount = videoCountByCategory.get(cat.id) ?? 0
                return (
                  <div key={cat.id} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors group flex items-start gap-2">
                    <button className="flex-1 text-left" onClick={() => setSelectedCategoryId(cat.id)}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-100 group-hover:text-white break-words">{cat.name}</span>
                        <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1.5">
                        {videoCount} {videoCount === 1 ? 'video' : 'videos'}
                        {subCatCount > 0 && ` · ${subCatCount} sub ${subCatCount === 1 ? 'category' : 'categories'}`}
                      </p>
                    </button>
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button onClick={() => setRenamingCategory(cat)} className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Rename">
                        <IconEdit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat)} className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Level 1: Category detail — sections with DnD ── */}
      {showingCategoryLevel && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {sortedSectionEntries.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No videos in this category yet. Add a video above.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedSectionEntries.map(([key, vids]) => {
                const subCat = key === '' ? null : subCategoryMap.get(key)
                return (
                  <Section
                    key={key}
                    sectionKey={key}
                    label={key === '' ? 'Direct Videos' : (subCat?.name ?? key)}
                    videos={vids}
                    isDropTarget={overSectionKey === key}
                    onDrillDown={(k) => setSelectedSubCategoryId(k)}
                    onVideoDeleted={() => router.refresh()}
                    onVideoEdit={(v) => setEditingVideo(v)}
                    onRename={subCat ? () => setRenamingSubCategory(subCat) : undefined}
                    onDelete={subCat ? () => handleDeleteSubCategory(subCat) : undefined}
                  />
                )
              })}
            </div>
          )}
          <DragOverlay>
            {activeVideo ? <SortableVideoRow video={activeVideo} onDeleted={() => {}} onEdit={() => {}} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Level 2: Sub-category detail ── */}
      {showingSubCatLevel && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {subCatVideos.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No videos in this sub category yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <SortableContext items={subCatVideos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                {subCatVideos.map((v) => (
                  <SortableVideoRow key={v.id} video={v} onDeleted={() => router.refresh()} onEdit={(v) => setEditingVideo(v)} />
                ))}
              </SortableContext>
            </div>
          )}
          <DragOverlay>
            {activeVideo ? <SortableVideoRow video={activeVideo} onDeleted={() => {}} onEdit={() => {}} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Modals ── */}

      {/* Create category */}
      {showCreateCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowCreateCategory(false); setNewCategoryName('') }} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold text-zinc-50 mb-4">Add Category</h2>
            <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
              placeholder="Category name" autoFocus
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors mb-4" />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowCreateCategory(false); setNewCategoryName('') }} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">Cancel</button>
              <button type="button" disabled={!newCategoryName.trim() || creatingCategory} onClick={handleCreateCategory} className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {creatingCategory ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename category */}
      {renamingCategory && (
        <RenameModal
          title={`Rename "${renamingCategory.name}"`}
          currentName={renamingCategory.name}
          onSave={handleRenameCategory}
          onClose={() => setRenamingCategory(null)}
          saving={renamingCategorySaving}
        />
      )}

      {/* Create sub-category */}
      {showCreateSubCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowCreateSubCategory(false); setNewSubCategoryName('') }} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-base font-semibold text-zinc-50 mb-1">Add Sub Category</h2>
            <p className="text-xs text-zinc-500 mb-4">Under: <span className="text-zinc-300">{selectedCat?.name}</span></p>
            <input type="text" value={newSubCategoryName} onChange={(e) => setNewSubCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSubCategory()}
              placeholder="Sub category name (e.g. Grandstand)" autoFocus
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors mb-4" />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowCreateSubCategory(false); setNewSubCategoryName('') }} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">Cancel</button>
              <button type="button" disabled={!newSubCategoryName.trim() || creatingSubCategory} onClick={handleCreateSubCategory} className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {creatingSubCategory ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename sub-category */}
      {renamingSubCategory && (
        <RenameModal
          title={`Rename "${renamingSubCategory.name}"`}
          currentName={renamingSubCategory.name}
          onSave={handleRenameSubCategory}
          onClose={() => setRenamingSubCategory(null)}
          saving={renamingSubCategorySaving}
        />
      )}

      {/* Edit video panel */}
      {editingVideo && (
        <EditVideoPanel
          video={editingVideo}
          categories={initialCategories}
          subCategories={initialSubCategories}
          onClose={() => setEditingVideo(null)}
          onSaved={() => { setEditingVideo(null); router.refresh() }}
        />
      )}

      {/* Add video panel */}
      <div className={`fixed inset-0 z-50 flex transition-opacity duration-200 ${showAddVideo ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddVideo(false)} />
        <div className={`relative ml-auto w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl transition-transform duration-200 ${showAddVideo ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
            <h2 className="text-base font-semibold text-zinc-50">Upload Video</h2>
            <button onClick={() => setShowAddVideo(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <VideoForm key={videoFormKey} categories={initialCategories} subCategories={initialSubCategories} />
          </div>
        </div>
      </div>
    </div>
  )
}
