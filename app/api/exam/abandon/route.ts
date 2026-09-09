import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Called by the exam page with navigator.sendBeacon when the employee leaves
// mid-attempt (tab close, reload, navigating away). Marks THEIR attempt
// abandoned; answers are never stored for it. Same-origin cookies carry the
// session, so this is the signed-in user's own attempt or nothing.
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response(null, { status: 401 })

  let attemptId: string | null = null
  try {
    const body = (await request.json()) as { attemptId?: unknown }
    if (typeof body.attemptId === 'string') attemptId = body.attemptId
  } catch {
    // sendBeacon can arrive as text/plain — fall through to "abandon all open".
  }

  const admin = createAdminClient()
  let q = admin
    .from('cert_quiz_attempts')
    .update({ abandoned_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('submitted_at', null)
    .is('abandoned_at', null)
  if (attemptId) q = q.eq('id', attemptId)
  const { error } = await q
  if (error) {
    console.error('[exam abandon] failed:', error.message)
    return new Response(null, { status: 500 })
  }
  return new Response(null, { status: 204 })
}
