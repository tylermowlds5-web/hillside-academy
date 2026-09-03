'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlantData } from '@/lib/types'
import { parseBulkPlantSource, parseJsonText, type BulkPlantEntry } from '@/lib/plant-import'
import { bulkAddCertPlantPages } from '@/app/cert-admin-actions'

// ── Bulk plant import ─────────────────────────────────────────────────────
// Button + dialog that turns a batch of plant_data JSON into draft plant
// pages on a lesson. Sources combine: dropped/chosen .json files (one plant
// per file; an array inside a file is spread) plus pasted JSON (an array or
// a single object). Every entry runs through the same validator as "Paste
// plant copy" and the preview lists each plant with its problems. Create is
// all-or-nothing: disabled until every entry is clean, and the server
// re-validates before inserting. New rows land with needs_review = true,
// so nothing reaches employees until an admin reviews it.

export type ImportLesson = { id: string; title: string }

type FileSource = { key: string; name: string; entries: BulkPlantEntry[] }

let fileSeq = 0

export default function BulkPlantImport({
  lessons,
  defaultLessonId,
  lockLesson = false,
  onImported,
  className,
}: {
  lessons: ImportLesson[]
  defaultLessonId?: string
  // Pages editor: the lesson is the one being edited, not a choice.
  lockLesson?: boolean
  onImported: (requirementId: string, ids: string[], plants: PlantData[]) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={lessons.length === 0}
        title={lessons.length === 0 ? 'Add a lesson module first' : 'Import many plant pages from JSON'}
        className={
          className ??
          'flex-shrink-0 rounded-full border border-emerald-600/50 px-4 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-600/10 disabled:opacity-50'
        }
      >
        Bulk import plants
      </button>
      {open && (
        <ImportDialog
          lessons={lessons}
          defaultLessonId={defaultLessonId}
          lockLesson={lockLesson}
          onImported={(reqId, ids, plants) => {
            onImported(reqId, ids, plants)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ImportDialog({
  lessons,
  defaultLessonId,
  lockLesson,
  onImported,
  onClose,
}: {
  lessons: ImportLesson[]
  defaultLessonId?: string
  lockLesson: boolean
  onImported: (requirementId: string, ids: string[], plants: PlantData[]) => void
  onClose: () => void
}) {
  const [lessonId, setLessonId] = useState(
    defaultLessonId && lessons.some((l) => l.id === defaultLessonId) ? defaultLessonId : lessons[0]?.id ?? ''
  )
  const [files, setFiles] = useState<FileSource[]>([])
  const [pasteText, setPasteText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !importing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, importing])

  // Pasted JSON validates live as you type.
  const pasted: BulkPlantEntry[] = useMemo(() => {
    const text = pasteText.trim()
    if (!text) return []
    try {
      return parseBulkPlantSource(parseJsonText(text), 'Pasted')
    } catch (err) {
      return [
        {
          source: 'Pasted',
          name: '(pasted JSON)',
          data: { common_name: '' },
          problems: [err instanceof Error ? err.message : 'Not valid JSON'],
        },
      ]
    }
  }, [pasteText])

  const entries = [...files.flatMap((f) => f.entries), ...pasted]
  const problemCount = entries.filter((e) => e.problems.length > 0).length
  const canCreate = entries.length > 0 && problemCount === 0 && !!lessonId && !importing && !reading

  async function addFiles(list: FileList | File[]) {
    const picked = Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.json') || f.type === 'application/json')
    const skipped = Array.from(list).length - picked.length
    if (skipped > 0) setError(`${skipped} file${skipped === 1 ? ' was' : 's were'} skipped — only .json files are read.`)
    else setError(null)
    if (picked.length === 0) return
    setReading(true)
    try {
      const next: FileSource[] = []
      for (const file of picked) {
        const key = `file-${Date.now()}-${fileSeq++}`
        try {
          const raw = parseJsonText(await file.text())
          next.push({ key, name: file.name, entries: parseBulkPlantSource(raw, file.name) })
        } catch (err) {
          next.push({
            key,
            name: file.name,
            entries: [
              {
                source: file.name,
                name: file.name,
                data: { common_name: '' },
                problems: [err instanceof Error ? err.message : 'Could not read this file'],
              },
            ],
          })
        }
      }
      setFiles((prev) => [...prev, ...next])
    } finally {
      setReading(false)
    }
  }

  async function handleCreate() {
    if (!canCreate) return
    setImporting(true)
    setError(null)
    try {
      const plants = entries.map((e) => e.data)
      const { ids } = await bulkAddCertPlantPages(lessonId, plants)
      onImported(lessonId, ids, plants)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const lesson = lessons.find((l) => l.id === lessonId)

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !importing) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk import plants"
    >
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <div className="mb-4">
          <h3 className="font-serif text-xl font-semibold text-plum">Bulk import plants</h3>
          <p className="mt-1 text-sm text-plum/60">
            Drop <span className="font-mono text-xs">.json</span> files (one plant each) or paste a JSON
            array of plants. Every plant becomes its own page, appended after the lesson&apos;s existing
            pages and flagged <span className="font-semibold text-amber-700">Needs review</span> —
            hidden from employees until you review it.
          </p>
        </div>

        {/* Lesson */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-plum/60">Lesson</label>
          {lockLesson || lessons.length === 1 ? (
            <p className="rounded-lg border border-plum/10 bg-plum/5 px-3 py-2 text-sm font-medium text-plum">
              {lesson?.title ?? 'Lesson'}
            </p>
          ) : (
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="w-full rounded-lg border border-plum/20 bg-white px-3 py-2 text-sm text-plum focus:border-emerald-600 focus:outline-none"
            >
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Files */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void addFiles(e.dataTransfer.files)
          }}
          className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
            dragging ? 'border-emerald-600 bg-emerald-600/5' : 'border-plum/20 bg-plum/[0.03]'
          }`}
        >
          <p className="text-sm text-plum/70">
            {reading ? 'Reading files…' : 'Drop .json files here'}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={reading}
            className="mt-2 rounded-full border border-plum/20 bg-white px-4 py-1.5 text-xs font-semibold text-plum/70 transition-colors hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-50"
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-xs text-plum/70">
                <span className="truncate font-mono">{f.name}</span>
                <span className="text-plum/40">
                  · {f.entries.length} plant{f.entries.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                  className="ml-auto rounded px-2 py-0.5 text-red-600 hover:bg-red-500/10"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Paste */}
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-plum/60">Or paste JSON (an array of plants, or one plant)</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder='[ { "common_name": "Arborvitae", ... }, { "common_name": "Boxwood", ... } ]'
            className="w-full rounded-lg border border-plum/20 bg-white px-3 py-2 font-mono text-xs text-plum placeholder-plum/30 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        {/* Preview */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-plum/50">Preview</p>
            {entries.length > 0 && (
              <p className="text-xs text-plum/60">
                {entries.length} plant{entries.length === 1 ? '' : 's'} found
                {problemCount > 0 ? (
                  <span className="font-semibold text-red-600"> · {problemCount} with problems</span>
                ) : (
                  <span className="font-semibold text-emerald-700"> · all valid</span>
                )}
              </p>
            )}
          </div>
          {entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-plum/15 px-3 py-4 text-center text-xs text-plum/40">
              Plants you add will be listed here with any validation errors.
            </p>
          ) : (
            <ol className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {entries.map((e, i) => {
                const bad = e.problems.length > 0
                return (
                  <li
                    key={`${e.source}-${i}`}
                    className={`rounded-lg border px-3 py-2 ${
                      bad ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-600/20 bg-emerald-600/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 flex-shrink-0 text-xs font-semibold text-plum/40">{i + 1}.</span>
                      <span className={`truncate text-sm font-medium ${bad ? 'text-red-700' : 'text-plum'}`}>{e.name}</span>
                      <span className="ml-auto flex-shrink-0 truncate font-mono text-[10px] text-plum/40">{e.source}</span>
                    </div>
                    {bad && (
                      <ul className="mt-1 space-y-0.5 pl-7 text-xs text-red-600">
                        {e.problems.map((p, pi) => (
                          <li key={pi}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        {problemCount > 0 && (
          <p className="mt-3 text-xs text-plum/60">
            Nothing is created while any entry has problems. Fix the file (or the pasted JSON) and add it again.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-plum/10 pt-4">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {importing
              ? 'Creating…'
              : `Create ${entries.length || ''} draft page${entries.length === 1 ? '' : 's'}`.replace('  ', ' ')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-full border border-plum/15 px-5 py-2 text-sm font-semibold text-plum/70 transition-colors hover:border-plum/30 hover:text-plum disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
