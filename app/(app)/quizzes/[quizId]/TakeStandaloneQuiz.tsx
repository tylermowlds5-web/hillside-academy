'use client'

import { useRouter } from 'next/navigation'
import type { QuizQuestion } from '@/lib/types'
import { submitStandaloneQuizAttempt } from '@/app/actions'
import QuizCard from '../../watch/[videoId]/QuizCard'

// Thin client wrapper around QuizCard for the standalone-quiz flow.
// Wires up the standalone submit action and routes the "Done" / completion
// click back to the dashboard.

export default function TakeStandaloneQuiz({
  quizId,
  questions,
  passingScore,
}: {
  quizId: string
  questions: QuizQuestion[]
  passingScore: number
}) {
  const router = useRouter()

  return (
    <QuizCard
      quiz={{ id: quizId, questions }}
      passingScore={passingScore}
      failureMode="retake"
      onSubmit={(answers) => submitStandaloneQuizAttempt(quizId, answers)}
      onComplete={() => router.push('/dashboard')}
    />
  )
}
