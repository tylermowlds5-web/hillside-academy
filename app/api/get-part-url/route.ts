import { UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

/**
 * Returns a presigned PUT URL for a single part of an in-progress multipart
 * upload. The browser PUTs the chunk directly to R2 and reads the ETag from the
 * response, which it later passes to /api/complete-multipart-upload.
 *
 * Request body: { key: string, uploadId: string, partNumber: number }
 * Response:     { url }
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

  let body: { key?: string; uploadId?: string; partNumber?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const key = body.key?.trim()
  const uploadId = body.uploadId?.trim()
  const partNumber = body.partNumber
  if (!key || !uploadId) {
    return Response.json({ error: 'key and uploadId are required' }, { status: 400 })
  }
  // S3/R2 part numbers are 1–10000.
  if (!Number.isInteger(partNumber) || partNumber! < 1 || partNumber! > 10000) {
    return Response.json({ error: 'partNumber must be an integer between 1 and 10000' }, { status: 400 })
  }
  if (!process.env.R2_BUCKET_NAME) {
    return Response.json({ error: 'R2 storage is not fully configured' }, { status: 500 })
  }

  try {
    const s3 = getR2Client()
    const url = await getSignedUrl(
      s3,
      new UploadPartCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 3600 } // 1 hour per part
    )

    return Response.json({ url })
  } catch (err) {
    console.error('[get-part-url] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Failed to sign part URL: ${message}` }, { status: 500 })
  }
}
