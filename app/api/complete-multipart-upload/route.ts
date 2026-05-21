import { CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { getR2Client } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

type PartInput = { PartNumber?: number; ETag?: string }

/**
 * Finalizes a multipart upload by stitching all uploaded parts together.
 *
 * Request body: { key, uploadId, parts: [{ PartNumber, ETag }] }
 * Response:     { publicUrl }
 *
 * Pass { key, uploadId, abort: true } to cancel an upload instead — this tells
 * R2 to discard any parts already uploaded so they don't linger and incur cost.
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

  let body: { key?: string; uploadId?: string; parts?: PartInput[]; abort?: boolean }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const key = body.key?.trim()
  const uploadId = body.uploadId?.trim()
  if (!key || !uploadId) {
    return Response.json({ error: 'key and uploadId are required' }, { status: 400 })
  }
  if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) {
    return Response.json({ error: 'R2 storage is not fully configured' }, { status: 500 })
  }

  const s3 = getR2Client()

  // Abort path — discard any parts already uploaded.
  if (body.abort) {
    try {
      await s3.send(
        new AbortMultipartUploadCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
        })
      )
      console.log('[complete-multipart-upload] aborted', { key, uploadId })
      return Response.json({ aborted: true })
    } catch (err) {
      console.error('[complete-multipart-upload] abort error:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      return Response.json({ error: `Failed to abort upload: ${message}` }, { status: 500 })
    }
  }

  const parts = body.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    return Response.json({ error: 'parts array is required' }, { status: 400 })
  }
  for (const p of parts) {
    if (!Number.isInteger(p.PartNumber) || !p.ETag) {
      return Response.json(
        { error: 'each part needs a numeric PartNumber and an ETag' },
        { status: 400 }
      )
    }
  }

  // R2 requires parts in ascending PartNumber order.
  const sortedParts = [...parts].sort((a, b) => a.PartNumber! - b.PartNumber!)

  try {
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sortedParts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
        },
      })
    )

    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
    console.log('[complete-multipart-upload] completed', { key, parts: sortedParts.length })

    return Response.json({ publicUrl })
  } catch (err) {
    console.error('[complete-multipart-upload] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Failed to complete upload: ${message}` }, { status: 500 })
  }
}
