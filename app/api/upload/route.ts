import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// Mobile devices emit a range of video MIME types. We accept anything that
// starts with "video/" OR has a known video extension. Common mobile outputs:
//   iOS: video/mp4, video/quicktime (.mov), sometimes video/hevc
//   Android: video/mp4, video/webm, video/3gpp
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

export async function POST(request: NextRequest) {
  // Auth check — admin only
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (profile?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse multipart body
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate type — accept any video MIME OR a known video extension
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  const isVideoMime = file.type?.startsWith('video/') ?? false
  if (!isVideoMime && !ALLOWED_EXTENSIONS.includes(ext)) {
    return Response.json(
      {
        error: `Please upload a video file. Detected type: ${file.type || 'unknown'}, extension: ${ext || 'none'}`,
      },
      { status: 400 }
    )
  }

  // Validate env
  if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) {
    return Response.json(
      { error: 'R2 storage is not fully configured. Set R2_BUCKET_NAME and R2_PUBLIC_URL.' },
      { status: 500 }
    )
  }

  // Build storage key
  const safeName = sanitizeFilename(file.name)
  const key = `videos/${Date.now()}-${safeName}`

  // Read file into buffer
  const buffer = Buffer.from(await file.arrayBuffer())

  // Upload to R2
  try {
    const s3 = getS3Client()
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || 'video/mp4',
      })
    )
  } catch (err) {
    console.error('R2 upload error:', err)
    return Response.json(
      { error: 'Upload to storage failed. Check R2 credentials.' },
      { status: 500 }
    )
  }

  const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  return Response.json({ url: publicUrl })
}
