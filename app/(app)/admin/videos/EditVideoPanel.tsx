'use client'

import { useState, useRef } from 'react'
import type { Video, Category, SubCategory } from '@/lib/types'
import { updateVideoMetadata } from '@/app/actions'

function uploadThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.set('file', file)
    const xhr = new XMLHttpRequest()
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { url, error } = JSON.parse(xhr.responseText)
          if (error) reject(new Error(error))
          else resolve(url as string)
        } catch {
          reject(new Error('Invalid response'))
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.open('POST', '/api/upload-thumbnail')
    xhr.send(fd)
  })
}

export default function EditVideoPanel({
  video,
  categories,
  subCategories,
  onClose,
  onSaved,
}: {
  video: Video
  categories: Category[]
  subCategories: SubCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(video.title)
  const [description, setDescription] = useState(video.description ?? '')
  const [categoryId, setCategoryId] = useState(video.category_id ?? '')
  const [subCategoryId, setSubCategoryId] = useState(video.sub_category_id ?? '')
  const [thumbnailUrl, setThumbnailUrl] = useState(video.thumbnail_url ?? '')
  const [thumbnailPreview, setThumbnailPreview] = useState(video.thumbnail_url ?? '')
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const thumbInputRef = useRef<HTMLInputElement>(null)

  // Sub-categories filtered to the selected category
  const filteredSubCats = subCategories.filter((sc) => sc.category_id === categoryId)

  function handleCategoryChange(newCatId: string) {
    setCategoryId(newCatId)
    setSubCategoryId('') // reset sub-category when category changes
  }

  async function handleThumbnailFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingThumb(true)
    setError(null)
    try {
      const preview = URL.createObjectURL(file)
      setThumbnailPreview(preview)
      const url = await uploadThumbnail(file)
      setThumbnailUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thumbnail upload failed')
      setThumbnailPreview(thumbnailUrl)
    } finally {
      setUploadingThumb(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const selectedCat = categories.find((c) => c.id === categoryId)
      const selectedSub = filteredSubCats.find((sc) => sc.id === subCategoryId)
      await updateVideoMetadata(video.id, {
        title: title.trim(),
        description: description.trim() || null,
        categoryId: categoryId || null,
        categoryName: selectedCat?.name ?? null,
        subCategoryId: subCategoryId || null,
        subCategoryName: selectedSub?.name ?? null,
        thumbnailUrl: thumbnailUrl || null,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-base font-semibold text-zinc-50">Edit Video</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Thumbnail */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Thumbnail</label>
            <div className="flex items-start gap-3">
              <div className="w-24 h-14 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden">
                {thumbnailPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input ref={thumbInputRef} type="file" accept="image/*" onChange={handleThumbnailFile} className="sr-only" id="edit-thumb-input" />
                <label htmlFor="edit-thumb-input"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs cursor-pointer hover:bg-zinc-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  {uploadingThumb ? 'Uploading…' : 'Upload new thumbnail'}
                </label>
                {thumbnailUrl && (
                  <button type="button" onClick={() => { setThumbnailUrl(''); setThumbnailPreview('') }}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors">
                    Remove thumbnail
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none" />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
            <select value={categoryId} onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors">
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Sub Category — only when category is selected */}
          {categoryId && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Sub Category <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <select value={subCategoryId} onChange={(e) => setSubCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors">
                <option value="">None</option>
                {filteredSubCats.map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2.5 text-sm text-red-400">{error}</div>
          )}
        </form>

        <div className="px-5 py-4 border-t border-zinc-800 flex-shrink-0 flex gap-2 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
