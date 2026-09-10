'use server'

import { createClient } from '@/lib/supabase/server'

// Deletes one of the signed-in employee's saved Ricky Bobby chats (messages
// cascade). RLS already scopes the delete to the owner; the explicit user_id
// filter is belt-and-braces.
export async function deleteRickyChat(chatId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { error } = await supabase.from('ricky_chats').delete().eq('id', chatId).eq('user_id', user.id)
  if (error) return { error: error.message }
  return {}
}
