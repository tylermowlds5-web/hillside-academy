import { CreateMultipartUploadCommand } from '@aws-sdk/client-s3'
import { getR2Client } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// Known video extensions for sanity-checking
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.hevc', '.3gp', '.3gpp']

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Initiates a multipart upload on R2 for a large video file.
 *
 * The browser uploads each ~10 MB part directly to R2 (see /api/get-part-url)
 * and then finalizes via /api/complete-multipart-upload. This bypasses Vercel's
 * 4.5 MB request body limit entirely — bytes never pass through the function.
 *
 * Request body: { filename: string, contentType?: string }
 * Response:     { uploadId, key, publicUrl }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { filename?: string; contentType?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const filename = body.filename?.trim()
  const contentType = body.contentType?.trim() || 'application/octet-stream'
  if (!filename) return Response.json({ error: 'filename required' }, { status: 400 })

  const ext = '.' + (filename.split('.').pop()?.toLowerCase() ?? '')
  const isVideoMime = contentType.startsWith('video/')
  if (!isVideoMime && !ALLOWED_EXTENSIONS.includes(ext)) {
    return Response.json(
      { error: `Not a video file (type: ${contentType}, ext: ${ext || 'none'})` },
      { status: 400 }
    )
  }

  if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) {
    return Response.json({ error: 'R2 storage is not fully configured' }, { status: 500 })
  }

  const key = `videos/${Date.now()}-${sanitizeFilename(filename)}`

  try {
    const s3 = getR2Client()
    const result = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      })
    )

    if (!result.UploadId) {
      throw new Error('R2 did not return an UploadId')
    }

    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
    console.log('[get-multipart-upload-url] initiated', { key, uploadId: result.UploadId })

    return Response.json({ uploadId: result.UploadId, key, publicUrl })
  } catch (err) {
    console.error('[get-multipart-upload-url] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Failed to start upload: ${message}` }, { status: 500 })
  }
}
