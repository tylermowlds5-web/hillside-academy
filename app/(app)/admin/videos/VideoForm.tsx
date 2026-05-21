'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createVideoFromUpload, createCategory, createSubCategory } from '@/app/actions'
import type { Category, SubCategory } from '@/lib/types'

type Status = 'idle' | 'uploading' | 'uploaded' | 'saving' | 'done' | 'error'
type GenState = 'idle' | 'transcribing' | 'generating' | 'error'

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

// ── Direct-to-R2 multipart upload ─────────────────────────────────────────
// Large videos (300 MB+) are split into 10 MB parts, each PUT straight to R2.
// Bytes never pass through Vercel, so the 4.5 MB function body limit and the
// practical limits of a single presigned PUT no longer apply.

const PART_SIZE = 50 * 1024 * 1024 // 50 MB per part — a 300 MB video is just 6 parts
const MAX_CONCURRENT_PARTS = 10 // R2 multiplexes these over HTTP/2

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    if (body?.error) return body.error
  } catch {}
  return `${fallback} (${res.status})`
}

async function startMultipartUpload(
  filename: string,
  contentType: string
): Promise<{ uploadId: string; key: string; publicUrl: string }> {
  const res = await fetch('/api/get-multipart-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to start upload'))
  return res.json()
}

// Fetches presigned URLs for every part in a single request, then returns them
// keyed by part number so workers can look one up without a round trip.
async function getAllPartUrls(
  key: string,
  uploadId: string,
  partNumbers: number[]
): Promise<Map<number, string>> {
  const res = await fetch('/api/get-part-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, uploadId, partNumbers }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to get part URLs'))
  const { urls } = (await res.json()) as { urls: { partNumber: number; url: string }[] }
  return new Map(urls.map((u) => [u.partNumber, u.url]))
}

// PUTs a single chunk to R2 and resolves with its ETag (needed to complete the
// upload). Note: we deliberately do NOT set a Content-Type header — the part
// URL is signed without one, and adding an unsigned header risks a signature
// mismatch. Reading the ETag back requires "ETag" in the bucket's CORS
// ExposeHeaders.
function putPart(
  url: string,
  chunk: Blob,
  onProgress: (loadedBytes: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag')
        if (!etag) {
          reject(
            new Error(
              'R2 did not return an ETag for an uploaded part. Add "ETag" to the bucket CORS ExposeHeaders in the Cloudflare R2 dashboard.'
            )
          )
          return
        }
        onProgress(chunk.size) // mark this part fully done
        resolve(etag)
      } else {
        const body = xhr.responseText?.slice(0, 300) ?? ''
        reject(new Error(`R2 rejected a part (status ${xhr.status} ${xhr.statusText}). ${body}`))
      }
    })
    xhr.addEventListener('error', () => {
      if (xhr.status === 0) {
        reject(
          new Error(
            'Part upload blocked before reaching R2 — almost always a CORS issue. In Cloudflare → R2 → bucket → Settings → CORS, allow methods [PUT], headers [*], your app origin, and expose the ETag header.'
          )
        )
      } else {
        reject(new Error(`Network error uploading a part (status ${xhr.status} ${xhr.statusText})`))
      }
    })
    xhr.addEventListener('abort', () => reject(new Error('Part upload aborted')))
    xhr.open('PUT', url)
    xhr.send(chunk)
  })
}

async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  try {
    await fetch('/api/complete-multipart-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, uploadId, abort: true }),
    })
  } catch {
    // Best-effort cleanup — ignore failures here so the original error surfaces.
  }
}

// Splits the file into parts, uploads them (a few in parallel) directly to R2
// while reporting overall progress, then finalizes the multipart upload.
// Returns the public URL of the assembled object.
async function uploadVideoMultipart(
  file: File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<string> {
  const { uploadId, key, publicUrl } = await startMultipartUpload(file.name, contentType)
  console.log('[videoUpload] multipart started', { key, uploadId, size: file.size })

  const totalParts = Math.ceil(file.size / PART_SIZE)
  const loaded = new Array<number>(totalParts).fill(0)
  const etags = new Array<{ PartNumber: number; ETag: string }>(totalParts)

  const reportProgress = () => {
    const sum = loaded.reduce((a, b) => a + b, 0)
    // Hold at 99% until the completion call returns, so 100% means truly done.
    onProgress(Math.min(99, Math.round((sum / file.size) * 100)))
  }

  try {
    // One authenticated round trip for all part URLs, before any bytes move.
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1)
    const partUrls = await getAllPartUrls(key, uploadId, partNumbers)

    let nextPart = 0
    async function worker() {
      while (nextPart < totalParts) {
        const idx = nextPart++
        const partNumber = idx + 1
        const start = idx * PART_SIZE
        const chunk = file.slice(start, Math.min(start + PART_SIZE, file.size))
        const url = partUrls.get(partNumber)
        if (!url) throw new Error(`Missing presigned URL for part ${partNumber}`)
        const etag = await putPart(url, chunk, (bytes) => {
          loaded[idx] = bytes
          reportProgress()
        })
        etags[idx] = { PartNumber: partNumber, ETag: etag }
      }
    }

    const workerCount = Math.min(MAX_CONCURRENT_PARTS, totalParts)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    const res = await fetch('/api/complete-multipart-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, uploadId, parts: etags }),
    })
    if (!res.ok) throw new Error(await readError(res, 'Failed to complete upload'))
    const { publicUrl: finalUrl } = await res.json()
    onProgress(100)
    return (finalUrl as string) || publicUrl
  } catch (err) {
    await abortMultipartUpload(key, uploadId)
    throw err
  }
}

// ── AI description generation ─────────────────────────────────────────────
// Talks to /api/generate-description, which splits the work into short calls so
// nothing exceeds the serverless function timeout (see that route for details).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function generateDescriptionApi<T>(body: object): Promise<T> {
  const res = await fetch('/api/generate-description', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res, 'Description request failed'))
  return res.json()
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
  onDirtyChange,
}: {
  categories: Category[]
  subCategories?: SubCategory[]
  // Lets the parent (the slide-over panel) know a video is selected/uploading so
  // it can warn before closing. "Dirty" = a file has been chosen.
  onDirtyChange?: (dirty: boolean) => void
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Bumped each time a new file is chosen, so a superseded background upload
  // can't clobber state for the file the admin actually kept.
  const uploadTokenRef = useRef(0)

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

  // The R2 public URL, set once the chosen video finishes uploading. Until it's
  // set, the video isn't in storage yet — Save and Generate Description wait on it.
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [genState, setGenState] = useState<GenState>('idle')
  const [genError, setGenError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setFileUrl(null); return }
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Report dirty state (a file is selected/uploading) up to the parent panel.
  useEffect(() => {
    onDirtyChange?.(!!file)
  }, [file, onDirtyChange])

  // Only saving locks the form. While the video uploads in the background, every
  // field stays editable — just the Save button waits for the upload to finish.
  const saving = status === 'saving'
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
    // Invalidate any in-flight upload from a previously-selected file.
    const token = ++uploadTokenRef.current
    setFile(picked)
    setThumbnailUrl(null)
    setVideoUrl(null)
    setGenState('idle')
    setGenError(null)
    setError(null)
    if (picked && !title) {
      setTitle(picked.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
    }
    // Upload to R2 right away so the thumbnail scrubber, AI description button,
    // and Save can all work against the stored video.
    if (picked) void startVideoUpload(picked, token)
    else setStatus('idle')
  }

  // Uploads the chosen video to R2 in the background; videoUrl is set on success.
  // `token` guards against a stale upload (from a replaced file) writing state.
  async function startVideoUpload(picked: File, token: number) {
    setStatus('uploading')
    setUploadProgress(0)
    const contentType = picked.type || 'application/octet-stream'
    try {
      const url = await uploadVideoMultipart(picked, contentType, (pct) => {
        if (token === uploadTokenRef.current) setUploadProgress(pct)
      })
      if (token !== uploadTokenRef.current) return // a newer file replaced this one
      setVideoUrl(url)
      setStatus('uploaded')
      console.log('[videoUpload] upload complete, public URL:', url)
    } catch (err) {
      if (token !== uploadTokenRef.current) return
      console.error('[videoUpload] upload failed:', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  // Transcribes the uploaded video and writes a generated description into the
  // field. The admin can edit the result before saving.
  async function handleGenerateDescription() {
    if (!videoUrl || genState === 'transcribing' || genState === 'generating') return
    setGenError(null)
    setGenState('transcribing')
    try {
      const { transcriptId } = await generateDescriptionApi<{ transcriptId: string }>({ videoUrl })

      // Poll until AssemblyAI finishes (or fails).
      for (;;) {
        const { status: tStatus, error: tError } = await generateDescriptionApi<{
          status: string
          error: string | null
        }>({ transcriptId })
        if (tStatus === 'completed') break
        if (tStatus === 'error') throw new Error(tError || 'Transcription failed')
        await sleep(3000)
      }

      setGenState('generating')
      const { description: generated } = await generateDescriptionApi<{ description: string }>({
        transcriptId,
        summarize: true,
      })
      setDescription(generated)
      setGenState('idle')
    } catch (err) {
      setGenState('error')
      setGenError(err instanceof Error ? err.message : 'Failed to generate description')
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
    // Category is required so videos never end up uncategorized and invisible.
    if (!categorySelect) { setError('Please select or create a category'); return }
    if (categorySelect === '__new__' && !newCategoryName.trim()) {
      setError('Enter a name for the new category'); return
    }
    // The video uploads as soon as it's chosen — wait for it before saving.
    if (status === 'uploading' || !videoUrl) {
      setError('Please wait for the video to finish uploading'); return
    }

    // Resolve category/sub-category IDs (creating new rows if needed) before save
    let resolved
    try {
      resolved = await resolveCategoryIds()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Invalid category')
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
      setVideoUrl(null)
      setTitle('')
      setDescription('')
      setGenState('idle')
      setGenError(null)
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
          disabled={saving}
        />
        <label
          htmlFor="video-file-input"
          className={`flex items-center gap-3 w-full max-w-full px-4 py-3 min-h-[48px] rounded-lg border text-sm cursor-pointer transition-colors touch-manipulation ${
            file
              ? 'border-emerald-600 bg-emerald-950/30 text-emerald-300'
              : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 active:bg-zinc-700'
          } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
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

      {/* Upload progress — stays visible at 100% once the upload finishes so the
          admin can see it's ready (saving only happens when they click Save). */}
      {(status === 'uploading' || status === 'uploaded' || status === 'saving') && (
        <div className="space-y-1.5 w-full max-w-full">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>
              {status === 'uploading'
                ? 'Uploading video…'
                : status === 'uploaded'
                ? 'Upload complete — ready to save'
                : 'Saving to library…'}
            </span>
            {status === 'uploading' && <span>{uploadProgress}%</span>}
            {status === 'uploaded' && <span className="text-emerald-400">100%</span>}
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                status === 'saving'
                  ? 'bg-emerald-400 animate-pulse w-full'
                  : status === 'uploaded'
                  ? 'bg-emerald-500 w-full'
                  : 'bg-emerald-500'
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
          disabled={saving}
          className="w-full max-w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
        />
      </div>

      {/* Category */}
      <div className="w-full max-w-full">
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          value={categorySelect}
          onChange={(e) => handleCategoryChange(e.target.value)}
          disabled={saving}
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
            disabled={saving}
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
            disabled={saving || categorySelect === '__new__'}
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
              disabled={saving}
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
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label className="block text-sm font-medium text-zinc-300">Description</label>
          {/* Only available once the video is in R2 (we need its URL to transcribe). */}
          {videoUrl && (
            <button
              type="button"
              onClick={handleGenerateDescription}
              disabled={busy || genState === 'transcribing' || genState === 'generating'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {genState === 'transcribing' || genState === 'generating' ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              )}
              {genState === 'transcribing'
                ? 'Transcribing video…'
                : genState === 'generating'
                ? 'Generating description…'
                : 'Generate Description with AI'}
            </button>
          )}
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Brief description…"
          disabled={saving}
          className="w-full max-w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none disabled:opacity-50"
        />
        {(genState === 'transcribing' || genState === 'generating') && (
          <p className="text-xs text-zinc-500 mt-1">
            {genState === 'transcribing'
              ? 'Transcribing the video audio — this can take a minute…'
              : 'Writing a description from the transcript…'}
          </p>
        )}
        {genError && <p className="text-xs text-red-400 mt-1 break-words">{genError}</p>}
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
        disabled={busy || !file || !videoUrl}
        className="w-full py-3 px-4 min-h-[48px] rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors touch-manipulation cursor-pointer"
      >
        {status === 'uploading'
          ? `Uploading ${uploadProgress}%…`
          : status === 'saving'
          ? 'Saving…'
          : 'Save Video'}
      </button>
    </form>
  )
}
