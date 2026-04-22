import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp',
  '.zip', '.png', '.jpg', '.jpeg', '.gif',
]

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB

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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'File too large (max 50 MB)' }, { status: 400 })
  }

  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return Response.json(
      { error: `File type ${ext} not allowed` },
      { status: 400 }
    )
  }

  if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) {
    return Response.json(
      { error: 'R2 storage is not fully configured' },
      { status: 500 }
    )
  }

  const safeName = sanitizeFilename(file.name)
  const key = `documents/${Date.now()}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const s3 = getS3Client()
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || 'application/octet-stream',
      })
    )
  } catch (err) {
    console.error('R2 upload error:', err)
    return Response.json({ error: 'Upload failed' }, { status: 500 })
  }

  const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  return Response.json({
    url: publicUrl,
    fileType: file.type || ext,
    fileSize: file.size,
    fileName: file.name,
  })
}
