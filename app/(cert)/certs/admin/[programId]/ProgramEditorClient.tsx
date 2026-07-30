'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Video, Profile, JobRole, UserJobRole } from '@/lib/types'
import EmployeeSelector from '@/app/(app)/admin/EmployeeSelector'
import {
  addCertModule,
  removeCertModule,
  reorderCertModules,
  updateCertModule,
  setCertAssignments,
} from '@/app/cert-admin-actions'
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

// Module list + enrollment for the cert builder. Modules reorder with the
// same dnd-kit pattern as PathFormClient; per-module quiz settings and text
// lesson content edit inline.

export type EditorModule = {
  id: string
  kind: 'video' | 'lesson' | 'hu-quiz' | 'hu-path'
  title: string
  passScore: number
  drawCount: number
  groupCount: number
  questionCount: number
  videoId?: string
  lessonBody?: string
  lessonImageUrl?: string | null
}

const KIND_LABEL: Record<EditorModule['kind'], string> = {
  video: 'Video',
  lesson: 'Lesson',
  'hu-quiz': 'HU quiz',
  'hu-path': 'HU path',
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

// ── Sortable module row ───────────────────────────────────────────────────

function ModuleRow({
  programId,
  mod,
  position,
  onRemove,
  onSaved,
}: {
  programId: string
  mod: EditorModule
  position: number
  onRemove: () => void
  onSaved: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id })

  const [expanded, setExpanded] = useState(false)
  const [passScore, setPassScore] = useState(String(mod.passScore))
  const [drawCount, setDrawCount] = useState(String(mod.drawCount))
  const [lessonTitle, setLessonTitle] = useState(mod.title)
  const [lessonBody, setLessonBody] = useState(mod.lessonBody ?? '')
  const [lessonImageUrl, setLessonImageUrl] = useState(mod.lessonImageUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    const pass = parseInt(passScore, 10)
    const draw = parseInt(drawCount, 10)
    if (isNaN(pass) || pass < 1 || pass > 100) { setError('Pass mark must be 1–100'); return }
    if (isNaN(draw) || draw < 1) { setError('Draw count must be at least 1'); return }
    setSaving(true)
    try {
      await updateCertModule(mod.id, {
        passScore: pass,
        drawCount: draw,
        ...(mod.kind === 'lesson'
          ? { lessonTitle, lessonBody, lessonImageUrl }
          : {}),
      })
      setExpanded(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      setLessonImageUrl(await uploadCertImage(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="bg-zinc-900 border border-zinc-800 rounded-xl"
    >
      <div className="flex items-center gap-3 p-3">
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
        <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
          {KIND_LABEL[mod.kind]}
        </span>
        <p className="flex-1 min-w-0 text-sm font-medium text-zinc-100 truncate">{mod.title}</p>

        <Link
          href={`/certs/admin/${programId}/modules/${mod.id}`}
          className="flex-shrink-0 text-xs text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20"
        >
          Questions ({mod.groupCount}·{mod.questionCount})
        </Link>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1.5 rounded hover:bg-zinc-800"
        >
          {expanded ? 'Close' : 'Settings'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 text-xs text-red-500 hover:text-red-400 px-2 py-1.5 rounded hover:bg-red-500/10"
        >
          Remove
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Quiz pass mark (%)</label>
              <input
                type="number" min={1} max={100} value={passScore}
                onChange={(e) => setPassScore(e.target.value)}
                className="w-28 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Groups drawn per attempt</label>
              <input
                type="number" min={1} value={drawCount}
                onChange={(e) => setDrawCount(e.target.value)}
                className="w-28 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {mod.kind === 'lesson' && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Lesson title</label>
                <input
                  type="text" value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Lesson text <span className="text-zinc-600">(blank line = new paragraph)</span>
                </label>
                <textarea
                  value={lessonBody} rows={6}
                  onChange={(e) => setLessonBody(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Lesson image</label>
                <div className="flex items-center gap-3">
                  {lessonImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lessonImageUrl} alt="" className="h-16 w-24 object-cover rounded-lg border border-zinc-700" />
                  )}
                  <label className="text-xs text-emerald-400 hover:text-emerald-300 px-3 py-2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer">
                    {uploading ? 'Uploading…' : lessonImageUrl ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
                  </label>
                  {lessonImageUrl && (
                    <button
                      type="button"
                      onClick={() => setLessonImageUrl(null)}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save module'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────

export default function ProgramEditorClient({
  programId,
  initialModules,
  allVideos,
  usedVideoIds,
  employees,
  roles,
  userRoles,
  initialAssignedIds,
}: {
  programId: string
  initialModules: EditorModule[]
  allVideos: Video[]
  usedVideoIds: string[]
  employees: Profile[]
  roles: JobRole[]
  userRoles: UserJobRole[]
  initialAssignedIds: string[]
}) {
  const router = useRouter()
  const [modules, setModules] = useState(initialModules)
  const [videoSearch, setVideoSearch] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [moduleError, setModuleError] = useState<string | null>(null)

  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set(initialAssignedIds))
  const [savingAssignments, setSavingAssignments] = useState(false)
  const [assignmentsSaved, setAssignmentsSaved] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const usedIds = new Set([
    ...usedVideoIds,
    ...modules.filter((m) => m.videoId).map((m) => m.videoId as string),
  ])
  const availableVideos = allVideos
    .filter((v) => !usedIds.has(v.id))
    .filter((v) => v.title.toLowerCase().includes(videoSearch.toLowerCase()))

  async function handleAddVideo(video: Video) {
    setAdding(true)
    setModuleError(null)
    try {
      const { id } = await addCertModule(programId, { kind: 'video', videoId: video.id })
      setModules((prev) => [
        ...prev,
        { id, kind: 'video', title: video.title, passScore: 80, drawCount: 4, groupCount: 0, questionCount: 0, videoId: video.id },
      ])
    } catch (err) {
      setModuleError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleAddLesson() {
    const title = lessonTitle.trim()
    if (!title) { setModuleError('Enter a lesson title first'); return }
    setAdding(true)
    setModuleError(null)
    try {
      const { id } = await addCertModule(programId, { kind: 'lesson', title })
      setModules((prev) => [
        ...prev,
        { id, kind: 'lesson', title, passScore: 80, drawCount: 4, groupCount: 0, questionCount: 0, lessonBody: '', lessonImageUrl: null },
      ])
      setLessonTitle('')
    } catch (err) {
      setModuleError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this module? Its question bank, attempts, and progress go with it.')) return
    setModuleError(null)
    const prev = modules
    setModules((m) => m.filter((x) => x.id !== id))
    try {
      await removeCertModule(id)
    } catch (err) {
      setModules(prev)
      setModuleError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = modules.findIndex((m) => m.id === active.id)
    const newIndex = modules.findIndex((m) => m.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(modules, oldIndex, newIndex)
    setModules(next)
    try {
      await reorderCertModules(programId, next.map((m) => m.id))
    } catch (err) {
      setModuleError(err instanceof Error ? err.message : 'Reorder failed — refresh and try again')
    }
  }

  async function handleSaveAssignments() {
    setSavingAssignments(true)
    setAssignError(null)
    setAssignmentsSaved(false)
    try {
      await setCertAssignments(programId, [...selectedEmployees])
      setAssignmentsSaved(true)
      router.refresh()
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingAssignments(false)
    }
  }

  return (
    <>
      {/* ── Modules ── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Modules</h2>
          <span className="text-xs text-zinc-500">{modules.length} module{modules.length === 1 ? '' : 's'} · unlock in order</span>
        </div>

        {moduleError && (
          <div className="mb-3 rounded-lg bg-red-950 border border-red-800 px-4 py-2.5 text-sm text-red-400">
            {moduleError}
          </div>
        )}

        {modules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center mb-4">
            <p className="text-sm text-zinc-500">No modules yet. Add a video or a text lesson below.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 mb-5">
                {modules.map((m, i) => (
                  <ModuleRow
                    key={m.id}
                    programId={programId}
                    mod={m}
                    position={i + 1}
                    onRemove={() => handleRemove(m.id)}
                    onSaved={() => router.refresh()}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add video module */}
        <div className="border-t border-zinc-800 pt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Add a video module</p>
            <input
              type="text"
              value={videoSearch}
              onChange={(e) => setVideoSearch(e.target.value)}
              placeholder="Search the video library…"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 mb-2"
            />
            {videoSearch.trim() !== '' && (
              availableVideos.length > 0 ? (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {availableVideos.slice(0, 20).map((v) => (
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
                        onClick={() => handleAddVideo(v)}
                        disabled={adding}
                        className="text-xs text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 flex-shrink-0 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No videos match your search.</p>
              )
            )}
          </div>

          {/* Add text lesson */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Add a text / image lesson</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="Lesson title, e.g. Plant Identification Basics"
                className="flex-1 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddLesson}
                disabled={adding}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                Add lesson
              </button>
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">
              After adding, open the module&apos;s Settings to write the lesson text and attach an image,
              and its Questions link to build the question bank.
            </p>
          </div>
        </div>
      </section>

      {/* ── Enrollment ── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Enrollment</h2>
        {assignError && (
          <div className="mb-3 rounded-lg bg-red-950 border border-red-800 px-4 py-2.5 text-sm text-red-400">
            {assignError}
          </div>
        )}
        <EmployeeSelector
          employees={employees}
          roles={roles}
          userRoles={userRoles}
          selected={selectedEmployees}
          onChange={(next) => { setSelectedEmployees(next); setAssignmentsSaved(false) }}
        />
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={handleSaveAssignments}
            disabled={savingAssignments}
            className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {savingAssignments ? 'Saving…' : 'Save enrollment'}
          </button>
          {assignmentsSaved && <span className="text-sm text-emerald-400">Saved</span>}
        </div>
      </section>
    </>
  )
}
