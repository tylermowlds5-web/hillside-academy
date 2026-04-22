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

export type QuizQuestion = {
  question_text: string
  options: { option_text: string; is_correct: boolean }[]
}

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
