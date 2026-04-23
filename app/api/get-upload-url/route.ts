import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  if (!accountId) throw new Error('R2_ACCOUNT_ID is not configured')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

/**
 * Returns a presigned PUT URL the browser can use to upload a video directly
 * to R2 — bypassing the Vercel 4.5 MB request body limit.
 *
 * Request body: { filename: string, contentType?: string }
 * Response:     { uploadUrl, publicUrl, key }
 *
 * NOTE: R2 bucket CORS must allow PUT from the app origin. Configure CORS in
 * the Cloudflare R2 dashboard with AllowedMethods: [PUT], AllowedHeaders: [*],
 * and AllowedOrigins including your production + local dev origins.
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

  const safeName = sanitizeFilename(filename)
  const key = `videos/${Date.now()}-${safeName}`

  try {
    const s3 = getS3Client()
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 } // 1 hour to upload
    )

    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`

    console.log('[get-upload-url] signed PUT for', key, 'contentType:', contentType)
    console.log('[get-upload-url] uploadUrl (first 120):', uploadUrl.slice(0, 120))

    // Return the SAME contentType the URL was signed with so the client can
    // echo it in its PUT request header (R2 requires an exact match).
    return Response.json({ uploadUrl, publicUrl, key, contentType })
  } catch (err) {
    console.error('[get-upload-url] signing error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error signing URL'
    return Response.json({ error: `Failed to generate upload URL: ${message}` }, { status: 500 })
  }
}
