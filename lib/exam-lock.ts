import { createAdminClient } from './supabase/admin'
import { EXAM_IDLE_MS } from './exam-rules'

// Server-side view of "does this employee have an exam open right now".
// An attempt is OPEN when it has neither been submitted nor abandoned and
// its last activity is inside the idle window; anything older is treated
// as abandoned even before a row says so (the client timer and the next
// start/submit stamp abandoned_at, but the lock must not depend on that).

export async function hasOpenExamAttempt(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - EXAM_IDLE_MS).toISOString()
  const { count, error } = await admin
    .from('cert_quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('submitted_at', null)
    .is('abandoned_at', null)
    .gt('last_activity_at', cutoff)
  if (error) {
    // Fail open for the lock only if the column set is missing (pre-Step 16
    // database) — otherwise a schema hiccup would silence Ricky for everyone.
    console.error('[exam-lock] open-attempt check failed:', error.message)
    return false
  }
  return (count ?? 0) > 0
}

// Abandons every open attempt of this user (optionally sparing one). Used
// when a new attempt starts, when the client reports leaving, and as
// cleanup for idle-expired rows.
export async function abandonOpenExamAttempts(userId: string, exceptAttemptId?: string): Promise<void> {
  const admin = createAdminClient()
  let q = admin
    .from('cert_quiz_attempts')
    .update({ abandoned_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('submitted_at', null)
    .is('abandoned_at', null)
  if (exceptAttemptId) q = q.neq('id', exceptAttemptId)
  const { error } = await q
  if (error) console.error('[exam-lock] abandon failed:', error.message)
}
