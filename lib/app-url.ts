// Single source of truth for the public app URL used in outbound email links,
// auth redirects, etc. Always reads `NEXT_PUBLIC_APP_URL` so emails point at the
// configured production domain (e.g. hillsideuniversity.com) instead of a
// Vercel preview / deployment hostname.
//
// In production, NEXT_PUBLIC_APP_URL MUST be set — otherwise email links break.
// In development we fall back to localhost:3000 for convenience.

export function getAppBaseUrl(): string {
  // Server actions can read both prefixed (NEXT_PUBLIC_) and unprefixed env
  // vars; we check the unprefixed APP_URL first so it can act as a
  // server-only override when needed. Both are logged so we can see exactly
  // which value the deploy is picking up.
  const serverOnly = process.env.APP_URL?.replace(/\/$/, '')
  const publicVar = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  console.log('[getAppBaseUrl] env probe — APP_URL:', JSON.stringify(serverOnly), '| NEXT_PUBLIC_APP_URL:', JSON.stringify(publicVar), '| NODE_ENV:', process.env.NODE_ENV)
  const url = serverOnly || publicVar
  if (url) {
    console.log('[getAppBaseUrl] resolved baseUrl:', url)
    return url
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log('[getAppBaseUrl] dev fallback → http://localhost:3000')
    return 'http://localhost:3000'
  }
  console.warn('[getAppBaseUrl] NO env var set — links in emails will be broken. Set NEXT_PUBLIC_APP_URL or APP_URL on the deployment.')
  return ''
}
