import type { QuizQuestion, QuizSubmittedAnswer, StoredAnswer, QuizReviewItem } from './types'
import { quizQuestionType, quizAcceptedAnswers } from './types'

// Shared scoring helper used by both video and standalone quiz attempts.
// Returns the score (0–100), the fully-correct question count, and the
// per-question stored breakdown used by the review screen.
export function scoreQuiz(
  questions: QuizQuestion[],
  answers: Record<number, QuizSubmittedAnswer>
): { score: number; correct: number; storedAnswers: StoredAnswer[] } {
  let correct = 0
  let creditSum = 0
  const storedAnswers: StoredAnswer[] = questions.map((q, qi) => {
    const answer = answers[qi]
    const type = quizQuestionType(q)
    const options = q.options ?? []

    if (type === 'multiple_choice' || type === 'true_false') {
      const selectedIndex = typeof answer === 'number' ? answer : -1
      const chosenOpt = options[selectedIndex]
      const correctOpt = options.find((o) => o.is_correct)
      const isCorrect = !!chosenOpt?.is_correct
      if (isCorrect) { correct++; creditSum++ }
      return {
        question_text: q.question_text,
        chosen: chosenOpt?.option_text ?? '(no answer)',
        correct: correctOpt?.option_text ?? '?',
        is_correct: isCorrect,
      }
    }

    if (type === 'multiple_select') {
      const picked = Array.isArray(answer) ? (answer as number[]) : []
      const pickedSet = new Set(picked)
      const isCorrect = options.length > 0 && options.every((o, i) => pickedSet.has(i) === !!o.is_correct)
      if (isCorrect) { correct++; creditSum++ }
      const chosenTexts = picked.map((i) => options[i]?.option_text).filter((t): t is string => !!t)
      const correctTexts = options.filter((o) => o.is_correct).map((o) => o.option_text)
      return {
        question_text: q.question_text,
        chosen: chosenTexts.length ? chosenTexts.join(', ') : '(no answer)',
        correct: correctTexts.length ? correctTexts.join(', ') : '?',
        is_correct: isCorrect,
      }
    }

    if (type === 'short_answer') {
      const given = typeof answer === 'string' ? answer : ''
      const accepted = quizAcceptedAnswers(q)
      const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
      const normGiven = norm(given)
      const isCorrect = normGiven.length > 0 && accepted.some((a) => norm(a) === normGiven)
      if (isCorrect) { correct++; creditSum++ }
      return {
        question_text: q.question_text,
        chosen: given || '(no answer)',
        correct: accepted.length > 0 ? accepted.join(' / ') : '?',
        is_correct: isCorrect,
      }
    }

    if (type === 'sequence') {
      const items = q.sequence_items ?? []
      const n = items.length
      const order = Array.isArray(answer) ? (answer as number[]) : []

      // Groups make a position p "correct" if the placed item is any member of
      // the group whose position range contains p. Build a position → allowed
      // member set; positions outside any group fall back to exact-match
      // (slot p must hold the item whose canonical index is p).
      const groups = q.sequence_groups ?? []
      const groupMembersByPosition: Map<number, Set<number>> = new Map()
      for (const g of groups) {
        const members = new Set(g)
        for (const p of g) groupMembersByPosition.set(p, members)
      }

      const slotCorrect: boolean[] = []
      let correctSlots = 0
      for (let p = 0; p < n; p++) {
        const placed = order[p]
        const groupMembers = groupMembersByPosition.get(p)
        const ok = groupMembers
          ? typeof placed === 'number' && placed >= 0 && groupMembers.has(placed)
          : placed === p
        slotCorrect.push(ok)
        if (ok) correctSlots++
      }
      const allCorrect = n > 0 && correctSlots === n
      const credit = n === 0 ? 0 : q.partial_credit === true ? correctSlots / n : allCorrect ? 1 : 0
      if (allCorrect) correct++
      creditSum += credit

      const chosenOrder = items.map((_, p) => {
        const idx = order[p]
        return idx >= 0 && idx < n ? items[idx] : ''
      })
      return {
        question_text: q.question_text,
        chosen: chosenOrder.map((t) => t || '(empty)').join(' → '),
        correct: items.join(' → '),
        is_correct: allCorrect,
        type: 'sequence',
        sequence: {
          correct_order: items.slice(),
          chosen_order: chosenOrder,
          slot_correct: slotCorrect,
        },
      }
    }

    return { question_text: q.question_text, chosen: '(no answer)', correct: '?', is_correct: false }
  })

  const score = questions.length > 0 ? Math.round((creditSum / questions.length) * 100) : 0
  return { score, correct, storedAnswers }
}

// Strip the answer key from the graded answers so the employee result screen
// can show what they chose and whether it was right — without ever exposing the
// correct answer (StoredAnswer.correct / sequence.correct_order are dropped).
export function toReview(storedAnswers: StoredAnswer[]): QuizReviewItem[] {
  return storedAnswers.map((a) => ({
    question_text: a.question_text,
    chosen: a.chosen,
    is_correct: a.is_correct,
    type: a.type,
    sequence: a.sequence
      ? { chosen_order: a.sequence.chosen_order, slot_correct: a.sequence.slot_correct }
      : undefined,
  }))
}
