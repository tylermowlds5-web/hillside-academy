import { createClient } from '@/lib/supabase/server'
import { hasOpenExamAttempt } from '@/lib/exam-lock'
import HillsideAIChat from './HillsideAIChat'

export const metadata = { title: 'Ricky Bobby' }

// Auth (redirect to /login) and the sidebar come from app/(app)/layout.tsx.
// The exam lock is enforced by the chat route on every request; this only
// lets the page open in the locked state instead of after the first send.
export default async function HillsideAIPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const examLocked = user ? await hasOpenExamAttempt(user.id) : false
  return <HillsideAIChat initialExamLocked={examLocked} />
}
