'use client'

import { useState } from 'react'
import type { DocumentRow, Category } from '@/lib/types'
import { recordDocumentView } from '@/app/actions'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileTypeLabel(type: string | null): string {
  if (!type) return 'FILE'
  const lower = type.toLowerCase()
  if (lower.includes('pdf')) return 'PDF'
  if (lower.includes('word') || lower.includes('.doc')) return 'DOC'
  if (lower.includes('sheet') || lower.includes('.xls')) return 'XLS'
  if (lower.includes('presentation') || lower.includes('.ppt')) return 'PPT'
  if (lower.startsWith('image/')) return 'IMG'
  return type.split('/').pop()?.toUpperCase().slice(0, 4) ?? 'FILE'
}

export default function DocumentsViewClient({
  documents,
  categories,
}: {
  documents: DocumentRow[]
  categories: Category[]
}) {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const catMap = new Map(categories.map((c) => [c.id, c.name]))

  const filtered = documents
    .filter((d) => filter === 'all' || d.category_id === filter)
    .filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))

  function handleOpen(doc: DocumentRow) {
    // Fire-and-forget view record; don't block navigation
    recordDocumentView(doc.id).catch((err) => console.error('[recordDocumentView]', err))
    window.open(doc.file_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-50">Documents</h1>
        <p className="text-zinc-400 text-sm mt-1">Training documents, guides, and resources</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents…"
          className="flex-1 px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500" />
        {categories.length > 0 && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No documents found.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((doc) => (
            <button key={doc.id} onClick={() => handleOpen(doc)}
              className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="w-11 h-14 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-emerald-400">{fileTypeLabel(doc.file_type)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 group-hover:text-white break-words">{doc.title}</p>
                  {doc.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{doc.description}</p>}
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-600 flex-wrap">
                    {doc.category_id && catMap.get(doc.category_id) && (
                      <span className="bg-zinc-800 px-1.5 py-0.5 rounded">{catMap.get(doc.category_id)}</span>
                    )}
                    {doc.file_size && <span>{formatSize(doc.file_size)}</span>}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
