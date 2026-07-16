import HillsideAIChat from './HillsideAIChat'

export const metadata = { title: 'Gus' }

// Auth (redirect to /login) and the sidebar come from app/(app)/layout.tsx.
export default function HillsideAIPage() {
  return <HillsideAIChat />
}
