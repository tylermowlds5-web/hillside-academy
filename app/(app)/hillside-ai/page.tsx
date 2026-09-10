import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasOpenExamAttempt } from '@/lib/exam-lock'
import type { RickyChatSummary } from '@/lib/types'
import HillsideAIChat, { type ChatMessage } from './HillsideAIChat'

export const metadata = { title: 'Ricky Bobby' }

// Auth (redirect to /login) and the sidebar come from app/(app)/layout.tsx.
// ?chat=<ricky_chats.id> reopens a saved conversation; no param = new chat.
// The exam lock is enforced by the chat route on every request; this only
// lets the page open in the locked state instead of after the first send.
export default async function HillsideAIPage(props: {
  searchParams: Promise<{ chat?: string | string[] }>
}) {
  const { chat } = await props.searchParams
  const requested = typeof chat === 'string' ? chat : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [examLocked, chatsRes] = await Promise.all([
    hasOpenExamAttempt(user.id),
    supabase
      .from('ricky_chats')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .returns<RickyChatSummary[]>(),
  ])
  // Before Step 17 is applied the table doesn't exist: log it and run with
  // an empty history rather than taking the chat down.
  if (chatsRes.error) console.error('[hillside-ai] chat list failed:', chatsRes.error.message)
  const chats = chatsRes.data ?? []

  let chatId: string | null = null
  let messages: ChatMessage[] = []
  if (requested) {
    // RLS hides other people's chats, so "not in my list" covers both
    // "deleted" and "not yours" — either way, fall back to a fresh chat.
    if (!chats.some((c) => c.id === requested)) redirect('/hillside-ai')
    const { data } = await supabase
      .from('ricky_messages')
      .select('role, content')
      .eq('chat_id', requested)
      .order('created_at')
      .returns<ChatMessage[]>()
    chatId = requested
    messages = data ?? []
  }

  // key: switching chats remounts the client with clean state.
  return (
    <HillsideAIChat
      key={chatId ?? 'new'}
      initialExamLocked={examLocked}
      chatId={chatId}
      initialMessages={messages}
      chats={chats}
    />
  )
}
