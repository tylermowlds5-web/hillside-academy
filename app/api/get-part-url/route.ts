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
 * Request body (current):  { key, uploadId, partNumbers: number[] }
 * Request body (legacy):   { key, uploadId, partNumber: number }
 * Response: { urls: Array<{ partNumber, url }> } — plus a top-level `url` when a
 * single legacy partNumber was requested, so an older cached client still works.
 */
export async function POST(request: NextRequest) {
  // Logs the message and returns a 400 so failures are diagnosable in the
  // function logs (which fields were missing/wrong for the body we received).
  const fail = (message: string, received: unknown) => {
    console.error('[get-part-url] 400:', message, '— received body:', JSON.stringify(received))
    return Response.json({ error: message }, { status: 400 })
  }

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

  let body: { key?: string; uploadId?: string; partNumbers?: number[]; partNumber?: number }
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON', '(unparseable)')
  }

  // Full request body, so we can see exactly what format the client is sending.
  console.log('[get-part-url] received body:', JSON.stringify(body))

  const key = body.key?.trim()
  const uploadId = body.uploadId?.trim()
  if (!key || !uploadId) {
    return fail('key and uploadId are required', body)
  }

  // Accept both the new `partNumbers` array and the legacy single `partNumber`.
  const isLegacySingle = body.partNumbers === undefined && body.partNumber !== undefined
  const partNumbers: number[] = isLegacySingle ? [body.partNumber as number] : (body.partNumbers ?? [])

  if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
    return fail('partNumbers (array) or partNumber (number) is required', body)
  }
  // S3/R2 allow at most 10000 parts; numbers are 1-based.
  if (partNumbers.length > 10000) {
    return fail('too many parts (max 10000)', body)
  }
  for (const n of partNumbers) {
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
      return fail('each partNumber must be an integer between 1 and 10000', body)
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

    console.log('[get-part-url] signed', urls.length, 'part URL(s) for key', key)

    // Legacy single-part callers read `{ url }`; new callers read `{ urls }`.
    return Response.json(isLegacySingle ? { url: urls[0].url, urls } : { urls })
  } catch (err) {
    console.error('[get-part-url] signing error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Failed to sign part URLs: ${message}` }, { status: 500 })
  }
}
