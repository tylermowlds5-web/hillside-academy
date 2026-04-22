import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

export function getR2Client(): S3Client {
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
 * Extracts the R2 object key from a public URL.
 * e.g. "https://pub-xxx.r2.dev/videos/123-file.mp4" → "videos/123-file.mp4"
 */
export function extractR2Key(url: string): string | null {
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? ''
  if (publicBase && url.startsWith(publicBase + '/')) {
    return url.slice(publicBase.length + 1)
  }
  // Fallback: parse URL and strip the leading slash from pathname
  try {
    return new URL(url).pathname.slice(1) || null
  } catch {
    return null
  }
}

/**
 * Deletes one or more R2 objects by their public URLs.
 * Errors are logged but not thrown so a single missing file doesn't abort deletion.
 */
export async function deleteR2Files(urls: (string | null | undefined)[]): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) {
    console.warn('deleteR2Files: R2_BUCKET_NAME is not set — skipping R2 deletion')
    return
  }

  let s3: S3Client
  try {
    s3 = getR2Client()
  } catch (err) {
    console.error('deleteR2Files: failed to create R2 client:', err)
    return
  }

  for (const url of urls) {
    if (!url) continue
    const key = extractR2Key(url)
    if (!key) {
      console.warn(`deleteR2Files: could not extract key from URL: ${url}`)
      continue
    }
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      console.log(`deleteR2Files: deleted "${key}"`)
    } catch (err) {
      console.error(`deleteR2Files: failed to delete "${key}":`, err)
    }
  }
}
