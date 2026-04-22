'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Video, Profile, JobRole, UserJobRole } from '@/lib/types'
import { savePathWithDetails } from '@/app/actions'
import EmployeeSelector from '../EmployeeSelector'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Mode = 'create' | 'edit'

interface Props {
  mode: Mode
  pathId?: string
  initialName?: string
  initialDescription?: string
  initialVideoIds?: string[]
  initialEmployeeIds?: string[]
  allVideos: Video[]
  employees: Profile[]
  roles: JobRole[]
  userRoles: UserJobRole[]
}

// ── Sortable selected-video row ──────────────────────────────────────────

function SortableVideoRow({
  id,
  position,
  video,
  onRemove,
  isOverlay = false,
}: {
  id: string
  position: number
  video: Video
  onRemove: () => void
  isOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
      className={`flex items-center gap-3 bg-zinc-900 border rounded-xl p-3 ${isOverlay ? 'border-emerald-500 shadow-xl' : 'border-zinc-800'}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 px-1 touch-none select-none"
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
          <circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" />
          <circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
        </svg>
      </div>
      <span className="flex-shrink-0 w-6 text-sm font-semibold text-zinc-500 text-center">{position}</span>
      <div className="w-16 h-9 rounded bg-zinc-800 flex-shrink-0 overflow-hidden">
        {video.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">{video.title}</p>
      </div>
      {!isOverlay && (
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 flex-shrink-0 cursor-pointer"
        >
          Remove
        </button>
      )}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────

export default function PathFormClient({
  mode,
  pathId,
  initialName = '',
  initialDescription = '',
  initialVideoIds = [],
  initialEmployeeIds = [],
  allVideos,
  employees,
  roles,
  userRoles,
}: Props) {
  const router = useRouter()

  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [videoIds, setVideoIds] = useState<string[]>(initialVideoIds)
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set(initialEmployeeIds))
  const [videoSearch, setVideoSearch] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const videoMap = new Map(allVideos.map((v) => [v.id, v]))
  const selectedVideos = videoIds
    .map((id) => videoMap.get(id))
    .filter((v): v is Video => !!v)

  const videoIdSet = new Set(videoIds)
  const availableVideos = allVideos
    .filter((v) => !videoIdSet.has(v.id))
    .filter((v) => v.title.toLowerCase().includes(videoSearch.toLowerCase()))

  function addVideo(videoId: string) {
    setVideoIds((prev) => [...prev, videoId])
  }

  function removeVideo(videoId: string) {
    setVideoIds((prev) => prev.filter((id) => id !== videoId))
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = videoIds.indexOf(active.id as string)
    const newIndex = videoIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    setVideoIds((prev) => arrayMove(prev, oldIndex, newIndex))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Path name is required'); return }

    setSaving(true)
    try {
      await savePathWithDetails({
        pathId,
        name: name.trim(),
        description: description.trim(),
        videoIds,
        employeeIds: [...selectedEmployees],
      })
      router.push('/admin/paths')
    } catch (err) {
      console.error('[PathForm save]', err)
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  const activeVideo = activeId ? videoMap.get(activeId) : null

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <Link
        href="/admin/paths"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Paths
      </Link>

      <h1 className="text-xl sm:text-2xl font-bold text-zinc-50 mb-6">
        {mode === 'create' ? 'New Learning Path' : 'Edit Learning Path'}
      </h1>

      {error && (
        <div className="mb-4 rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Path Name + Description */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Path Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. New Employee Onboarding"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What will employees learn from this path?"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
        </section>

        {/* Add Videos */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Add Videos</h2>
            <span className="text-xs text-zinc-500">{videoIds.length} selected</span>
          </div>

          {/* Search */}
          <input
            type="text"
            value={videoSearch}
            onChange={(e) => setVideoSearch(e.target.value)}
            placeholder="Search videos to add…"
            className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 mb-3"
          />

          {/* Available videos */}
          {availableVideos.length > 0 ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto mb-4 pr-1">
              {availableVideos.map((v) => (
                <div key={v.id} className="flex items-center gap-3 bg-zinc-800/60 rounded-lg p-2.5">
                  <div className="w-14 h-8 rounded bg-zinc-700 flex-shrink-0 overflow-hidden">
                    {v.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p className="flex-1 text-sm text-zinc-200 truncate">{v.title}</p>
                  <button
                    type="button"
                    onClick={() => addVideo(v.id)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 flex-shrink-0 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 mb-4">
              {videoSearch ? 'No videos match your search.' : 'All videos have been added.'}
            </p>
          )}

          {/* Selected videos (sortable) */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Videos in this path (drag to reorder)
            </p>
            {selectedVideos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center">
                <p className="text-sm text-zinc-500">No videos yet. Add some from the list above.</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={videoIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {selectedVideos.map((v, i) => (
                      <SortableVideoRow
                        key={v.id}
                        id={v.id}
                        position={i + 1}
                        video={v}
                        onRemove={() => removeVideo(v.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeVideo && (
                    <SortableVideoRow
                      id={activeVideo.id}
                      position={0}
                      video={activeVideo}
                      onRemove={() => {}}
                      isOverlay
                    />
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </section>

        {/* Assign Employees */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">Assign Employees</h2>
          <EmployeeSelector
            employees={employees}
            roles={roles}
            userRoles={userRoles}
            selected={selectedEmployees}
            onChange={setSelectedEmployees}
          />
        </section>

        {/* Save */}
        <div className="flex items-center justify-end gap-2 pb-6">
          <Link
            href="/admin/paths"
            className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors cursor-pointer"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Save Learning Path' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
