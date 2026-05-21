import { UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

/**
 * Presigns PUT URLs for parts of an in-progress multipart upload.
 *
 * Accepts a batch of part numbers and returns every URL in one round trip, so
 * the browser performs a single authenticated request up front instead of one
 * per part during the upload. Presigning is a local HMAC operation (no network
 * to R2), so signing many at once is cheap.
 *
 * Request body: { key: string, uploadId: string, partNumbers: number[] }
 * Response:     { urls: Array<{ partNumber: number, url: string }> }
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

  let body: { key?: string; uploadId?: string; partNumbers?: number[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const key = body.key?.trim()
  const uploadId = body.uploadId?.trim()
  const partNumbers = body.partNumbers
  if (!key || !uploadId) {
    return Response.json({ error: 'key and uploadId are required' }, { status: 400 })
  }
  if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
    return Response.json({ error: 'partNumbers must be a non-empty array' }, { status: 400 })
  }
  // S3/R2 allow at most 10000 parts; numbers are 1-based.
  if (partNumbers.length > 10000) {
    return Response.json({ error: 'too many parts (max 10000)' }, { status: 400 })
  }
  for (const n of partNumbers) {
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
      return Response.json(
        { error: 'each partNumber must be an integer between 1 and 10000' },
        { status: 400 }
      )
    }
  }
  if (!process.env.R2_BUCKET_NAME) {
    return Response.json({ error: 'R2 storage is not fully configured' }, { status: 500 })
  }

  try {
    const s3 = getR2Client()
    const bucket = process.env.R2_BUCKET_NAME
    const urls = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          s3,
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: 3600 } // 1 hour — generous for large uploads
        ),
      }))
    )

    return Response.json({ urls })
  } catch (err) {
    console.error('[get-part-url] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Failed to sign part URLs: ${message}` }, { status: 500 })
  }
}
