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

// Expected R2 account id (for verification in logs — not a secret). If the
// value in Vercel env doesn't match this, CORS / auth errors are likely.
const EXPECTED_R2_ACCOUNT_ID = '2ad46bfd20711383125fb58b4faeeed4'

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  if (!accountId) throw new Error('R2_ACCOUNT_ID is not configured')

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`

  // Verbose startup-of-request diagnostic — surfaces in Vercel function logs.
  console.log('[get-upload-url] ── S3 client config ──')
  console.log('[get-upload-url] endpoint        :', endpoint)
  console.log('[get-upload-url] region          : auto')
  console.log('[get-upload-url] forcePathStyle  : (default — false, virtual-hosted style)')
  console.log('[get-upload-url] R2_ACCOUNT_ID   :', accountId)
  console.log('[get-upload-url]   expected      :', EXPECTED_R2_ACCOUNT_ID)
  console.log('[get-upload-url]   matches?      :', accountId === EXPECTED_R2_ACCOUNT_ID)
  console.log('[get-upload-url] R2_BUCKET_NAME  :', process.env.R2_BUCKET_NAME ?? '(MISSING)')
  console.log('[get-upload-url] R2_PUBLIC_URL   :', process.env.R2_PUBLIC_URL ?? '(MISSING)')
  console.log('[get-upload-url] access key set? :', !!process.env.R2_ACCESS_KEY_ID,
    process.env.R2_ACCESS_KEY_ID ? `(length ${process.env.R2_ACCESS_KEY_ID.length})` : '')
  console.log('[get-upload-url] secret key set? :', !!process.env.R2_SECRET_ACCESS_KEY,
    process.env.R2_SECRET_ACCESS_KEY ? `(length ${process.env.R2_SECRET_ACCESS_KEY.length})` : '')

  return new S3Client({
    region: 'auto',
    endpoint,
    // Explicitly virtual-hosted style — R2 CORS is scoped per bucket, and the
    // virtual-hosted hostname <bucket>.<account>.r2.cloudflarestorage.com is
    // the one the browser will send preflight requests to.
    forcePathStyle: false,
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

    // Parse out the host of the signed URL so we can sanity-check that the
    // browser will hit the bucket's virtual-hosted URL (which is what CORS
    // policies on the R2 bucket apply to).
    let signedUrlHost = '(unknown)'
    try { signedUrlHost = new URL(uploadUrl).host } catch { /* ignore */ }

    console.log('[get-upload-url] ── signed URL ──')
    console.log('[get-upload-url] key             :', key)
    console.log('[get-upload-url] contentType     :', contentType)
    console.log('[get-upload-url] signed URL host :', signedUrlHost,
      '(this is the host the browser will PUT to; CORS must be set on the R2 bucket)')
    console.log('[get-upload-url] uploadUrl (120) :', uploadUrl.slice(0, 120))

    // Return the SAME contentType the URL was signed with so the client can
    // echo it in its PUT request header (R2 requires an exact match).
    return Response.json({ uploadUrl, publicUrl, key, contentType })
  } catch (err) {
    console.error('[get-upload-url] signing error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error signing URL'
    return Response.json({ error: `Failed to generate upload URL: ${message}` }, { status: 500 })
  }
}
