'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createVideoFromUpload, createCategory, createSubCategory } from '@/app/actions'
import type { Category, SubCategory } from '@/lib/types'

type Status = 'idle' | 'uploading' | 'saving' | 'done' | 'error'

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Still POSTs to server (thumbnails are small, fit in the 4.5 MB limit)
function uploadWithProgress(
  file: File,
  endpoint: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.set('file', file)
    const xhr = new XMLHttpRequest()
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
    }
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { url, error } = JSON.parse(xhr.responseText)
          if (error) reject(new Error(error))
          else resolve(url as string)
        } catch {
          reject(new Error('Invalid response from server'))
        }
      } else {
        try {
          const { error } = JSON.parse(xhr.responseText)
          reject(new Error(error ?? `Upload failed (${xhr.status})`))
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`))
        }
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.open('POST', endpoint)
    xhr.send(fd)
  })
}

// Videos use direct-to-R2 presigned PUT (bypasses Vercel 4.5 MB body limit)
async function getPresignedVideoUpload(
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string; contentType: string }> {
  const res = await fetch('/api/get-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType }),
  })
  if (!res.ok) {
    let message = `Failed to get upload URL (${res.status})`
    try {
      const body = await res.json()
      if (body.error) message = body.error
    } catch {}
    throw new Error(message)
  }
  return res.json()
}

function putFileToR2(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  // Detailed logging so production failures surface real info in the console.
  console.log('[uploadToR2] starting PUT')
  console.log('[uploadToR2] presigned URL (first 100):', url.slice(0, 100))
  console.log('[uploadToR2] content-type sent:', contentType)
  console.log('[uploadToR2] file:', {
    name: file.name,
    size: file.size,
    type: file.type || '(empty)',
  })

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
    }
    xhr.addEventListener('load', () => {
      const headers = xhr.getAllResponseHeaders()
      console.log('[uploadToR2] load — status:', xhr.status, xhr.statusText)
      console.log('[uploadToR2] response headers:\n' + headers)
      console.log('[uploadToR2] response body (first 500):', xhr.responseText.slice(0, 500))

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        // Surface R2's XML error body so the "SignatureDoesNotMatch" etc. is visible
        const body = xhr.responseText?.slice(0, 300) ?? ''
        reject(
          new Error(
            `R2 rejected upload (status ${xhr.status} ${xhr.statusText}). ${body || '(empty response body)'}`
          )
        )
      }
    })
    xhr.addEventListener('error', () => {
      console.error('[uploadToR2] error event fired')
      console.error('[uploadToR2] xhr.status:', xhr.status, 'statusText:', xhr.statusText)
      console.error('[uploadToR2] xhr.readyState:', xhr.readyState)
      const headers = xhr.getAllResponseHeaders()
      console.error('[uploadToR2] response headers:\n' + (headers || '(none — request likely never reached server)'))
      console.error('[uploadToR2] response body:', xhr.responseText || '(empty)')

      // status === 0 + no headers = CORS rejection OR the browser blocked the request
      if (xhr.status === 0) {
        reject(
          new Error(
            'Upload blocked before reaching R2. This is almost always a CORS issue on the R2 bucket. In Cloudflare → R2 → your bucket → Settings → CORS, add: AllowedMethods [PUT], AllowedHeaders [*], AllowedOrigins [your app origin]. Open DevTools Console for full details.'
          )
        )
      } else {
        reject(new Error(`Network error during upload (status ${xhr.status} ${xhr.statusText})`))
      }
    })
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.send(file)
  })
}

async function captureFrameAsFile(video: HTMLVideoElement): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 1280
  canvas.height = video.videoHeight || 720
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not available')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Frame capture failed'))),
      'image/jpeg',
      0.88
    )
  })
  return new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' })
}

// ── Thumbnail Scrubber ────────────────────────────────────────────────────

function ThumbnailScrubber({
  fileUrl,
  onThumbnailReady,
}: {
  fileUrl: string
  onThumbnailReady: (previewDataUrl: string, r2Url: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseFloat(e.target.value)
    setCurrentTime(t)
    if (videoRef.current) videoRef.current.currentTime = t
  }

  async function handleCapture() {
    const v = videoRef.current
    if (!v || v.readyState < 2) return
    setCaptureError(null)
    setCapturing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth || 1280
      canvas.height = v.videoHeight || 720
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
      setPreviewDataUrl(dataUrl)

      const thumbFile = await captureFrameAsFile(v)
      const r2Url = await uploadWithProgress(thumbFile, '/api/upload-thumbnail')
      onThumbnailReady(dataUrl, r2Url)
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Capture failed')
      setPreviewDataUrl(null)
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="space-y-2 w-full max-w-full">
      <div className="relative rounded-lg overflow-hidden bg-black aspect-video w-full max-w-full">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={fileUrl}
          className="w-full h-full object-contain"
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={() => {
            const v = videoRef.current!
            setDuration(v.duration)
            v.currentTime = 0
          }}
          onSeeked={() => {
            if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-white text-xs font-mono w-10 flex-shrink-0">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.05}
              value={currentTime}
              onChange={handleScrub}
              className="flex-1 min-w-0 h-1.5 cursor-pointer accent-emerald-400"
            />
            <span className="text-zinc-400 text-xs font-mono w-10 text-right flex-shrink-0">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleCapture}
          disabled={capturing || !duration}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
          {capturing ? 'Uploading…' : 'Set as Thumbnail'}
        </button>

        {previewDataUrl && !capturing && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewDataUrl} alt="Thumbnail preview" className="h-9 rounded aspect-video object-cover border border-emerald-700" />
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Thumbnail set
            </span>
          </div>
        )}

        {captureError && <span className="text-xs text-red-400">{captureError}</span>}
      </div>
    </div>
  )
}

// ── Main VideoForm ────────────────────────────────────────────────────────

export default function VideoForm({
  categories,
  subCategories = [],
}: {
  categories: Category[]
  subCategories?: SubCategory[]
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  // Category select: either a category id, '' (None), or '__new__' (creating inline)
  const [categorySelect, setCategorySelect] = useState<string>('')
  const [newCategoryName, setNewCategoryName] = useState('')

  // Sub-category select: either a sub-category id, '' (None), or '__new__'
  const [subCategorySelect, setSubCategorySelect] = useState<string>('')
  const [newSubCategoryName, setNewSubCategoryName] = useState('')

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setFileUrl(null); return }
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const busy = status === 'uploading' || status === 'saving'

  // For the sub-category select: show only sub-cats that belong to the chosen
  // existing category (filtering is skipped when creating a new category).
  const filteredSubCats = subCategories.filter((sc) => sc.category_id === categorySelect)

  function handleCategoryChange(value: string) {
    setCategorySelect(value)
    // Any category change clears the sub-cat selection
    setSubCategorySelect('')
    setNewSubCategoryName('')
    if (value !== '__new__') setNewCategoryName('')
  }

  function handleSubCategoryChange(value: string) {
    setSubCategorySelect(value)
    if (value !== '__new__') setNewSubCategoryName('')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    setFile(picked)
    setThumbnailUrl(null)
    if (picked && !title) {
      setTitle(picked.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
    }
  }

  async function resolveCategoryIds(): Promise<{ categoryId: string | null; categoryName: string | null; subCategoryId: string | null; subCategoryName: string | null }> {
    // Creates new category/sub-category rows as needed, returns final IDs + names.
    let categoryId: string | null = null
    let categoryName: string | null = null

    if (categorySelect === '__new__') {
      const name = newCategoryName.trim()
      if (!name) throw new Error('Enter a name for the new category')
      const created = await createCategory(name)
      categoryId = created.id
      categoryName = created.name
    } else if (categorySelect && categorySelect !== '') {
      categoryId = categorySelect
      categoryName = categories.find((c) => c.id === categorySelect)?.name ?? null
    }

    let subCategoryId: string | null = null
    let subCategoryName: string | null = null

    if (categoryId && subCategorySelect === '__new__') {
      const name = newSubCategoryName.trim()
      if (!name) throw new Error('Enter a name for the new sub category')
      const created = await createSubCategory(categoryId, name)
      subCategoryId = created.id
      subCategoryName = created.name
    } else if (subCategorySelect && subCategorySelect !== '') {
      subCategoryId = subCategorySelect
      subCategoryName = filteredSubCats.find((sc) => sc.id === subCategorySelect)?.name ?? null
    }

    return { categoryId, categoryName, subCategoryId, subCategoryName }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) { setError('Please choose a video file'); return }
    if (!title.trim()) { setError('Title is required'); return }

    setStatus('uploading')
    setUploadProgress(0)

    // Resolve category/sub-category IDs (creating new rows if needed) before upload
    let resolved
    try {
      resolved = await resolveCategoryIds()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Invalid category')
      return
    }

    // Direct-to-R2 upload
    const contentType = file.type || 'application/octet-stream'
    let videoUrl: string
    try {
      console.log('[videoUpload] requesting presigned URL — file:', file.name, '| contentType:', contentType, '| size:', file.size)
      const presign = await getPresignedVideoUpload(file.name, contentType)
      console.log('[videoUpload] presign response:', {
        uploadUrl: presign.uploadUrl.slice(0, 100) + '…',
        publicUrl: presign.publicUrl,
        contentType: presign.contentType,
      })

      // Use the server-echoed contentType so the PUT header matches what was
      // signed byte-for-byte (R2 returns SignatureDoesNotMatch on a mismatch).
      await putFileToR2(presign.uploadUrl, file, presign.contentType, setUploadProgress)
      videoUrl = presign.publicUrl
      console.log('[videoUpload] PUT succeeded, public URL:', videoUrl)
    } catch (err) {
      console.error('[videoUpload] upload failed:', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
      return
    }

    setStatus('saving')
    try {
      await createVideoFromUpload({
        title: title.trim(),
        url: videoUrl,
        description: description.trim(),
        category: resolved.categoryName ?? undefined,
        categoryId: resolved.categoryId ?? undefined,
        subCategory: resolved.subCategoryName ?? undefined,
        subCategoryId: resolved.subCategoryId ?? undefined,
        thumbnailUrl: thumbnailUrl ?? undefined,
      })
      setStatus('done')
      setFile(null)
      setTitle('')
      setDescription('')
      setCategorySelect('')
      setNewCategoryName('')
      setSubCategorySelect('')
      setNewSubCategoryName('')
      setThumbnailUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to save video')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4 w-full max-w-full"
    >
      {/* File picker */}
      <div className="w-full max-w-full">
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Video File <span className="text-red-500">*</span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.m4v,.webm,.hevc"
          onChange={handleFileChange}
          className="sr-only"
          id="video-file-input"
          disabled={busy}
        />
        <label
          htmlFor="video-file-input"
          className={`flex items-center gap-3 w-full max-w-full px-4 py-3 min-h-[48px] rounded-lg border text-sm cursor-pointer transition-colors touch-manipulation ${
            file
              ? 'border-emerald-600 bg-emerald-950/30 text-emerald-300'
              : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 active:bg-zinc-700'
          } ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="truncate min-w-0">{file ? file.name : 'Choose Video File'}</span>
          {file && (
            <span className="ml-auto flex-shrink-0 text-xs text-zinc-500">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          )}
        </label>
        <p className="text-xs text-zinc-600 mt-1">MP4, MOV, or WebM — uploads directly to storage, no size limit</p>
      </div>

      {file && fileUrl && (
        <div className="w-full max-w-full">
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Thumbnail
            <span className="ml-2 text-xs font-normal text-zinc-500">Scrub to a frame, then click Set as Thumbnail</span>
          </label>
          <ThumbnailScrubber
            fileUrl={fileUrl}
            onThumbnailReady={(_dataUrl, r2Url) => setThumbnailUrl(r2Url)}
          />
        </div>
      )}

      {/* Upload progress */}
      {(status === 'uploading' || status === 'saving') && (
        <div className="space-y-1.5 w-full max-w-full">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>{status === 'uploading' ? 'Uploading video…' : 'Saving to library…'}</span>
            {status === 'uploading' && <span>{uploadProgress}%</span>}
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                status === 'saving' ? 'bg-emerald-400 animate-pulse w-full' : 'bg-emerald-500'
              }`}
              style={status === 'uploading' ? { width: `${uploadProgress}%` } : undefined}
            />
          </div>
        </div>
      )}

      {/* Title */}
      <div className="w-full max-w-full">
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Safety Orientation"
          disabled={busy}
          className="w-full max-w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
        />
      </div>

      {/* Category */}
      <div className="w-full max-w-full">
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
        <select
          value={categorySelect}
          onChange={(e) => handleCategoryChange(e.target.value)}
          disabled={busy}
          className="w-full max-w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
        >
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__new__">+ New category…</option>
        </select>
        {categorySelect === '__new__' && (
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            disabled={busy}
            autoFocus
            className="mt-2 w-full max-w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-emerald-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
          />
        )}
      </div>

      {/* Sub Category (only when a category is selected/being created) */}
      {(categorySelect && categorySelect !== '') && (
        <div className="w-full max-w-full">
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Sub Category <span className="text-zinc-500 font-normal">(optional)</span>
          </label>
          <select
            value={subCategorySelect}
            onChange={(e) => handleSubCategoryChange(e.target.value)}
            disabled={busy || categorySelect === '__new__'}
            className="w-full max-w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
          >
            <option value="">None</option>
            {filteredSubCats.map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.name}</option>
            ))}
            {categorySelect !== '__new__' && (
              <option value="__new__">+ New sub category…</option>
            )}
          </select>
          {subCategorySelect === '__new__' && (
            <input
              type="text"
              value={newSubCategoryName}
              onChange={(e) => setNewSubCategoryName(e.target.value)}
              placeholder="Sub category name"
              disabled={busy}
              autoFocus
              className="mt-2 w-full max-w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-emerald-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
            />
          )}
          {categorySelect === '__new__' && (
            <p className="text-xs text-zinc-600 mt-1">You can add a sub category after creating the new category.</p>
          )}
        </div>
      )}

      {/* Description */}
      <div className="w-full max-w-full">
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Brief description…"
          disabled={busy}
          className="w-full max-w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none disabled:opacity-50"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2.5 text-sm text-red-400 w-full max-w-full break-words">
          {error}
        </div>
      )}

      {status === 'done' && (
        <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-3 py-2.5 text-sm text-emerald-400 flex items-center gap-2 w-full max-w-full">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Video uploaded and saved.
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !file}
        className="w-full py-3 px-4 min-h-[48px] rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors touch-manipulation cursor-pointer"
      >
        {status === 'uploading'
          ? `Uploading ${uploadProgress}%…`
          : status === 'saving'
          ? 'Saving…'
          : 'Upload Video'}
      </button>
    </form>
  )
}
