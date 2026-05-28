'use client'

import { useRef, useState } from 'react'

// Small preview player + range scrubber used in both the upload form and the
// edit-video modal. Admin scrubs to any frame and clicks "Capture Frame" to
// grab a thumbnail; the JPEG is POSTed to /api/upload-thumbnail (small payload,
// stays under the 4.5 MB function body limit) and the R2 URL is handed back.
//
// `fileUrl` is either a local `blob:` URL (fresh upload) or an already-saved
// R2 URL (edit modal). For the R2 case we need `crossOrigin="anonymous"` so
// the canvas read isn't blocked by tainting; for blob: URLs the attribute is
// omitted to avoid spurious CORS errors on some browsers.

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
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
    xhr.open('POST', '/api/upload-thumbnail')
    xhr.send(fd)
  })
}

export default function ThumbnailScrubber({
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

  // Already-uploaded R2 videos are cross-origin to this page, so the canvas
  // read in handleCapture would taint without explicit CORS opt-in.
  const isBlobUrl = fileUrl.startsWith('blob:')

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
      const r2Url = await uploadThumbnail(thumbFile)
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
          crossOrigin={isBlobUrl ? undefined : 'anonymous'}
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
          {capturing ? 'Uploading…' : 'Capture Frame'}
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
