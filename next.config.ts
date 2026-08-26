import type { NextConfig } from 'next'

// R2 public bucket that serves uploaded images (thumbnails, cert-images).
// Allowed here so next/image can serve resized versions — cards get small
// optimized files while lightboxes fetch the original from R2 directly.
const r2PublicUrl = (
  process.env.R2_PUBLIC_URL ?? 'https://pub-82ce9b67aaba4dea9abe240e91ea5b42.r2.dev'
).replace(/\/$/, '')

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL(`${r2PublicUrl}/**`)],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2gb',
    },
  },
}

export default nextConfig
