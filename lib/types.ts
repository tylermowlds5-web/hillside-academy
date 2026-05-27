export type Role = 'admin' | 'employee'

// Job roles / groups (Crew Lead, Crew Member, etc.) — distinct from the
// system-level Role union above. Stored in `roles` table; users can have
// many via the `user_roles` junction.
export type JobRole = {
  id: string
  name: string
  description: string | null
  created_at: string
}

export type UserJobRole = {
  id: string
  user_id: string
  role_id: string
  assigned_at: string
}

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: Role
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export type Category = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export type SubCategory = {
  id: string
  category_id: string
  name: string
  sort_order: number
  created_at: string
}

export type Video = {
  id: string
  title: string
  description: string | null
  url: string
  thumbnail_url: string | null
  duration: number | null
  category: string | null        // legacy text field (kept in sync with category_id)
  sub_category: string | null    // legacy text field (kept in sync with sub_category_id)
  category_id: string | null
  sub_category_id: string | null
  sort_order: number | null
  created_at: string
  created_by: string | null
}

export type Assignment = {
  id: string
  video_id: string
  user_id: string
  assigned_by: string | null
  assigned_at: string
  due_date: string | null
  video?: Video
  profile?: Profile
}

export type Progress = {
  id: string
  user_id: string
  video_id: string
  percent_watched: number
  last_watched_at: string
  completed: boolean
  quiz_passed: boolean
  watch_time_seconds: number
  // Real playback time actually watched (seconds). Accumulated from playback
  // time deltas — scrubbing/seeking does not inflate it. Completion requires
  // this to reach ≥85% of the video's duration.
  actual_seconds_watched: number
}

export type AssignmentWithDetails = Assignment & {
  video: Video
  progress: Progress | null
}

export type EmployeeProgress = {
  profile: Profile
  assignments: AssignmentWithDetails[]
}

// ── Session tracking ──────────────────────────────────────────────────────

export type Session = {
  id: string
  user_id: string
  logged_in_at: string
  logged_out_at: string | null
  duration_minutes: number | null
}

// ── Video watch events ────────────────────────────────────────────────────

export type VideoWatchEvent = {
  id: string
  user_id: string
  video_id: string
  watched_at: string
  percent_watched: number
  seconds_watched: number
}

// ── Quizzes (JSONB schema) ────────────────────────────────────────────────

export type QuizQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'multiple_select'
  | 'short_answer'
  | 'sequence'        // "Order the Steps" — drag items into the correct order
// NOTE: 'image_question' was removed — any question type can now have an
// optional image_url. Legacy questions with type: 'image_question' are
// normalized to 'multiple_choice' by quizQuestionType() below.

export type QuizOption = { option_text: string; is_correct: boolean }

// A single question. Stored as JSONB in quizzes.questions.
// Legacy rows (no `type`) are treated as 'multiple_choice'.
// `image_url` is optional on ANY question type — admin can attach an image to
// a multiple-choice, true/false, multiple-select, or short-answer question.
export type QuizQuestion = {
  // Accept legacy 'image_question' at the storage level; runtime code uses
  // `quizQuestionType()` which normalizes it to 'multiple_choice'.
  type?: QuizQuestionType | 'image_question'
  question_text: string
  options?: QuizOption[]      // multiple_choice, true_false, multiple_select
  image_url?: string | null   // any question type — optional
  correct_answer?: string     // legacy short_answer (single accepted answer)
  correct_answers?: string[]  // short_answer (multiple accepted answers)
  // ── sequence ("order the steps") ──────────────────────────────────────
  // Items stored in the CORRECT order: sequence_items[0] is step 1, etc.
  // Employees see them shuffled and drag them into numbered slots.
  sequence_items?: string[]
  // When true, each correctly-placed step earns partial credit (e.g. 3/4 = 75%).
  // When false/absent, the whole question is all-or-nothing.
  partial_credit?: boolean
}

// Helper so the rest of the codebase doesn't have to handle the optional
// `type` field everywhere. Normalizes legacy 'image_question' → 'multiple_choice'
// since images are now a cross-cutting feature, not a type.
export function quizQuestionType(q: QuizQuestion): QuizQuestionType {
  const t = q.type
  if (!t) return 'multiple_choice'
  if (t === 'image_question') return 'multiple_choice'
  if (
    t === 'multiple_choice' ||
    t === 'true_false' ||
    t === 'multiple_select' ||
    t === 'short_answer' ||
    t === 'sequence'
  ) {
    return t
  }
  // Unknown legacy value — fall back to multiple_choice to remain renderable
  return 'multiple_choice'
}

// Returns the list of accepted answers for a short_answer question.
// Reads new `correct_answers` (array) and falls back to legacy `correct_answer`
// (single string) so old quizzes keep working.
export function quizAcceptedAnswers(q: QuizQuestion): string[] {
  if (q.correct_answers && q.correct_answers.length > 0) {
    return q.correct_answers.filter((s) => s && s.trim().length > 0)
  }
  if (q.correct_answer && q.correct_answer.trim().length > 0) {
    return [q.correct_answer]
  }
  return []
}

// Answer payload submitted from the client per question (indexed by question
// position). `number` = index into options (mc/tf/iq), `number[]` = selected
// option indices (ms), `string` = typed answer (sa). For `sequence`, `number[]`
// is the chosen ordering: position p holds the original index (into
// sequence_items) of the item the employee placed in slot p; -1 = empty slot.
export type QuizSubmittedAnswer = number | number[] | string

export type Quiz = {
  id: string
  video_id: string
  questions: QuizQuestion[]
  passing_score: number
  created_at: string
  updated_at: string
}

export type StoredAnswer = {
  question_text: string
  chosen: string
  correct: string
  is_correct: boolean
  // Present for sequence questions — lets the review screen render a per-slot
  // breakdown (correct order vs. chosen order with green check / red X).
  type?: QuizQuestionType
  sequence?: {
    correct_order: string[]   // correct item text, slot 0 = step 1
    chosen_order: string[]    // employee's item text per slot ('' = left empty)
    slot_correct: boolean[]   // whether each slot matches the correct order
  }
}

export type QuizAttempt = {
  id: string
  user_id: string
  quiz_id: string
  video_id: string | null
  score: number
  passed: boolean
  taken_at: string
  answers?: StoredAnswer[] | null
}

// ── Learning paths ────────────────────────────────────────────────────────

export type LearningPath = {
  id: string
  name: string
  description: string | null
  is_required: boolean
  created_by: string | null
  created_at: string
}

export type LearningPathItem = {
  id: string
  path_id: string
  video_id: string
  sort_order: number
  created_at: string
}

export type LearningPathAssignment = {
  id: string
  path_id: string
  user_id: string
  assigned_by: string | null
  assigned_at: string
  completed_at: string | null
}

export type LearningPathWithProgress = LearningPath & {
  videos: Video[]
  totalVideos: number
  completedVideos: number
}

// ── Documents ─────────────────────────────────────────────────────────────

export type DocumentRow = {
  id: string
  title: string
  description: string | null
  file_url: string
  file_type: string | null
  file_size: number | null
  category_id: string | null
  uploaded_by: string | null
  created_at: string
}

export type DocumentView = {
  id: string
  user_id: string
  document_id: string
  viewed_at: string
}

export type LearningPathDocument = {
  id: string
  path_id: string
  document_id: string
  sort_order: number
  created_at: string
}
