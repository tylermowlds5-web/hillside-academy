// Exam sitting rules shared by the server (lib/exam-lock.ts, cert actions,
// the Ricky Bobby route) and the client (the quiz card). No server imports
// here so the client bundle can use it.

// Minutes without activity (answering) before an open attempt is abandoned.
export const EXAM_IDLE_MINUTES = 30
export const EXAM_IDLE_MS = EXAM_IDLE_MINUTES * 60 * 1000

// What Ricky says while the employee has an exam open.
export const EXAM_LOCK_MESSAGE = "Ricky's off while you've got an exam open. Finish or leave the exam to chat."

// Shown when the server refuses a submit because the attempt is no longer live.
export const EXAM_ABANDONED_MESSAGE =
  'That attempt was abandoned (you left the exam or sat idle for 30 minutes). Your answers were cleared — start over.'
