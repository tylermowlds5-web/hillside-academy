import { createClient } from '@/lib/supabase/server'
import { getR2Client } from '@/lib/r2'
import { ListObjectsV2Command, type ListObjectsV2CommandOutput, type S3Client } from '@aws-sdk/client-s3'

// Free-tier ceiling for Cloudflare R2 storage.
const FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let val = bytes / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  // One decimal place reads naturally for storage (e.g. "3.4 GB").
  return `${val.toFixed(1)} ${units[i]}`
}

export async function GET() {
  // Auth check — admin only
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
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) {
    return Response.json({ error: 'R2_BUCKET_NAME is not configured' }, { status: 500 })
  }

  let s3: S3Client
  try {
    s3 = getR2Client()
  } catch (err) {
    console.error('[storage-usage] failed to create R2 client:', err)
    return Response.json({ error: 'R2 client is not configured' }, { status: 500 })
  }

  try {
    let totalBytes = 0
    let objectCount = 0
    let continuationToken: string | undefined = undefined

    // Page through every object in the bucket. ListObjectsV2 returns at most
    // 1000 keys per call, so we follow ContinuationToken until exhausted.
    do {
      const res: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        })
      )
      for (const obj of res.Contents ?? []) {
        totalBytes += obj.Size ?? 0
        objectCount++
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (continuationToken)

    return Response.json({
      totalBytes,
      objectCount,
      humanSize: humanSize(totalBytes),
      freeTierBytes: FREE_TIER_BYTES,
    })
  } catch (err) {
    console.error('[storage-usage] failed to list bucket:', err)
    return Response.json({ error: 'Failed to read storage usage from R2' }, { status: 502 })
  }
}
