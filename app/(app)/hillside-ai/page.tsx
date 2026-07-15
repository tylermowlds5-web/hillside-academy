import HillsideAIChat from './HillsideAIChat'

export const metadata = { title: 'Hillside AI' }

// Auth (redirect to /login) and the sidebar come from app/(app)/layout.tsx.
export default function HillsideAIPage() {
  return <HillsideAIChat />
}
