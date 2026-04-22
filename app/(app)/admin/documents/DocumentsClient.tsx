'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { DocumentRow, Category } from '@/lib/types'
import { createDocument, deleteDocument, updateDocument } from '@/app/actions'
import { fmtDate } from '@/lib/format-date'

type DocWithCount = DocumentRow & { viewCount: number }

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
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

export default function DocumentsClient({
  documents,
  categories,
}: {
  documents: DocWithCount[]
  categories: Category[]
}) {
  const router = useRouter()
  const [showUpload, setShowUpload] = useState(false)
  const [editing, setEditing] = useState<DocumentRow | null>(null)

  async function handleDelete(doc: DocumentRow) {
    if (!confirm(`Delete "${doc.title}"?`)) return
    await deleteDocument(doc.id)
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-50">Documents</h1>
          <p className="text-zinc-400 text-sm mt-1">Upload and manage PDFs and other resources</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors">
          Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No documents yet. Click "Upload Document" to add one.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-400 font-medium">Title</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Type</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Size</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Views</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">Added</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-emerald-400">{fileTypeLabel(doc.file_type)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-zinc-100 font-medium truncate">{doc.title}</p>
                          {doc.description && <p className="text-xs text-zinc-500 truncate">{doc.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell whitespace-nowrap">{fileTypeLabel(doc.file_type)}</td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell whitespace-nowrap">{formatSize(doc.file_size)}</td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">{doc.viewCount}</td>
                    <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell whitespace-nowrap">{fmtDate(doc.created_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-zinc-400 hover:text-emerald-400 px-2 py-1 rounded hover:bg-zinc-800">
                        Open
                      </a>
                      <button onClick={() => setEditing(doc)}
                        className="text-xs text-zinc-400 hover:text-emerald-400 px-2 py-1 rounded hover:bg-zinc-800 ml-1">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(doc)}
                        className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 ml-1">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showUpload && (
        <UploadModal categories={categories} onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); router.refresh() }} />
      )}

      {editing && (
        <EditModal
          doc={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function UploadModal({
  categories,
  onClose,
  onDone,
}: {
  categories: Category[]
  onClose: () => void
  onDone: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'saving' | 'done' | 'error'>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
  }

  function uploadWithProgress(f: File): Promise<{ url: string; fileType: string; fileSize: number }> {
    return new Promise((resolve, reject) => {
      const fd = new FormData()
      fd.set('file', f)
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)) } catch { reject(new Error('Bad response')) }
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).error ?? 'Upload failed')) }
          catch { reject(new Error(`Upload failed (${xhr.status})`)) }
        }
      })
      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.open('POST', '/api/upload-document')
      xhr.send(fd)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) { setError('Please choose a file'); return }
    if (!title.trim()) { setError('Title is required'); return }

    setStatus('uploading')
    setUploadProgress(0)
    let uploadResult: { url: string; fileType: string; fileSize: number }
    try {
      uploadResult = await uploadWithProgress(file)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
      return
    }

    setStatus('saving')
    try {
      await createDocument({
        title: title.trim(),
        description: description.trim() || null,
        fileUrl: uploadResult.url,
        fileType: uploadResult.fileType,
        fileSize: uploadResult.fileSize,
        categoryId: categoryId || null,
      })
      setStatus('done')
      onDone()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative ml-auto w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-50">Upload Document</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">File <span className="text-red-500">*</span></label>
            <input ref={fileInputRef} type="file" onChange={handleFile} className="sr-only" id="doc-file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,.zip,.png,.jpg,.jpeg,.gif" />
            <label htmlFor="doc-file"
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                file ? 'border-emerald-600 bg-emerald-950/30 text-emerald-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
              }`}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm truncate">{file ? file.name : 'Choose file'}</span>
              {file && <span className="ml-auto text-xs">{formatSize(file.size)}</span>}
            </label>
            <p className="text-xs text-zinc-600 mt-1">PDF, Word, Excel, PowerPoint, etc. (max 50 MB)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500">
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {status === 'uploading' && (
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1"><span>Uploading</span><span>{uploadProgress}%</span></div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          {status === 'saving' && <p className="text-sm text-zinc-400">Saving…</p>}
          {error && <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-400">{error}</div>}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">Cancel</button>
          <button type="submit" disabled={!file || status === 'uploading' || status === 'saving'}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium">
            {status === 'uploading' ? `Uploading ${uploadProgress}%` : status === 'saving' ? 'Saving…' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditModal({
  doc,
  categories,
  onClose,
  onSaved,
}: {
  doc: DocumentRow
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(doc.title)
  const [description, setDescription] = useState(doc.description ?? '')
  const [categoryId, setCategoryId] = useState(doc.category_id ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateDocument(doc.id, {
        title: title.trim(),
        description: description.trim() || null,
        categoryId: categoryId || null,
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSave} className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-md shadow-2xl">
        <h2 className="text-base font-semibold text-zinc-50 mb-4">Edit Document</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500">
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !title.trim()}
            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
