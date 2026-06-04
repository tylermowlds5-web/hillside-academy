// Single source of truth for the public app URL used in outbound email links,
// auth redirects, etc. Always reads `NEXT_PUBLIC_APP_URL` so emails point at the
// configured production domain (e.g. hillsideuniversity.com) instead of a
// Vercel preview / deployment hostname.
//
// In production, NEXT_PUBLIC_APP_URL MUST be set — otherwise email links break.
// In development we fall back to localhost:3000 for convenience.

export function getAppBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (url) return url
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  console.warn('[getAppBaseUrl] NEXT_PUBLIC_APP_URL is not set — links in emails will be broken')
  return ''
}
