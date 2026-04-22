import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for admin operations that require elevated
 * privileges (creating users, deleting users, etc.).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env. Never expose this client or key
 * to the browser — server-side only.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — required for user admin operations'
    )
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
