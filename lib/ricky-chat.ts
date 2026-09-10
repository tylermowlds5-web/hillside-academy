// Shared between the chat route (which names a new chat) and the chat UI
// (which shows the name before the server round-trips).

export const RICKY_CHAT_TITLE_MAX = 60

// A chat's title is its first question, flattened to one line and cut at a
// word boundary. Kept short so the history sidebar stays scannable.
export function rickyChatTitle(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim()
  if (!flat) return 'New chat'
  if (flat.length <= RICKY_CHAT_TITLE_MAX) return flat
  const cut = flat.slice(0, RICKY_CHAT_TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return (space > RICKY_CHAT_TITLE_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…'
}
