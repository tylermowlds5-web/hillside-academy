'use server'

import { createClient } from '@/lib/supabase/server'
import { deleteR2Files } from '@/lib/r2'
import { sendAssignmentEmail, sendPathAssignmentEmail } from '@/lib/send-email'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { QuizQuestion, StoredAnswer, Category, SubCategory, QuizSubmittedAnswer } from '@/lib/types'
import { quizQuestionType, quizAcceptedAnswers } from '@/lib/types'

// ── Auth helpers ──────────────────────────────────────────────────────────

async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

async function requireAdmin() {
  const { supabase, user } = await getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return { supabase, user }
}

// ── Sessions ──────────────────────────────────────────────────────────────

export async function logSessionStart() {
  const { supabase, user } = await getUser()
  if (!user) return
  await supabase.from('sessions').insert({
    user_id: user.id,
    logged_in_at: new Date().toISOString(),
  })
}

export async function logSessionEnd() {
  const { supabase, user } = await getUser()
  if (!user) return

  const { data: session } = await supabase
    .from('sessions')
    .select('id, logged_in_at')
    .eq('user_id', user.id)
    .is('logged_out_at', null)
    .order('logged_in_at', { ascending: false })
    .limit(1)
    .single<{ id: string; logged_in_at: string }>()

  if (!session) return

  const loggedOut = new Date()
  const loggedIn = new Date(session.logged_in_at)
  const duration_minutes = Math.round((loggedOut.getTime() - loggedIn.getTime()) / 60000)

  await supabase
    .from('sessions')
    .update({
      logged_out_at: loggedOut.toISOString(),
      duration_minutes,
    })
    .eq('id', session.id)
}

// ── Progress ──────────────────────────────────────────────────────────────

export async function updateVideoProgress(videoId: string, percentWatched: number) {
  const { supabase, user } = await getUser()
  if (!user) return

  const pct = Math.min(100, Math.max(0, percentWatched))
  const completed = pct >= 100

  const { error } = await supabase.from('progress').upsert(
    {
      user_id: user.id,
      video_id: videoId,
      percent_watched: pct,
      completed,
      last_watched_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,video_id' }
  )
  if (error) console.error('[updateVideoProgress] upsert error:', error.message, error.code)
}

export async function logWatchEvent(
  videoId: string,
  percentWatched: number,
  secondsWatched: number
) {
  const { supabase, user } = await getUser()
  if (!user) return

  await supabase.from('video_watch_events').insert({
    user_id: user.id,
    video_id: videoId,
    watched_at: new Date().toISOString(),
    percent_watched: Math.round(Math.min(100, Math.max(0, percentWatched))),
    seconds_watched: Math.max(0, secondsWatched),
  })
}

// ── Videos (admin) ────────────────────────────────────────────────────────

export async function createVideo(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const url = formData.get('url') as string
  const thumbnail_url = formData.get('thumbnail_url') as string
  const durationRaw = formData.get('duration') as string
  const duration = durationRaw ? parseInt(durationRaw, 10) : null
  const category = formData.get('category') as string
  const sub_category = formData.get('sub_category') as string

  if (!title?.trim() || !url?.trim()) throw new Error('Title and URL are required')

  const { error: insertError } = await supabase.from('videos').insert({
    title: title.trim(),
    description: description?.trim() || null,
    url: url.trim(),
    thumbnail_url: thumbnail_url?.trim() || null,
    duration: duration && !isNaN(duration) ? duration : null,
    category: category?.trim() || null,
    sub_category: sub_category?.trim() || null,
    created_by: user.id,
  })

  if (insertError) throw new Error(`Database error: ${insertError.message}`)

  revalidatePath('/admin/videos')
  redirect('/admin/videos')
}

// Called from client after R2 upload — no redirect, returns to caller
export async function createVideoFromUpload({
  title,
  url,
  description,
  category,
  categoryId,
  subCategory,
  subCategoryId,
  thumbnailUrl,
}: {
  title: string
  url: string
  description?: string
  category?: string
  categoryId?: string
  subCategory?: string
  subCategoryId?: string
  thumbnailUrl?: string
}) {
  const { supabase, user } = await requireAdmin()
  if (!user) throw new Error('Not authenticated')
  if (!title.trim()) throw new Error('Title is required')
  if (!url.trim()) throw new Error('URL is required')

  const payload = {
    title: title.trim(),
    description: description?.trim() || null,
    url: url.trim(),
    thumbnail_url: thumbnailUrl?.trim() || null,
    duration: null,
    category: category?.trim() || null,
    category_id: categoryId ?? null,
    sub_category: subCategory?.trim() || null,
    sub_category_id: subCategoryId ?? null,
    created_by: user.id,
  }

  const { data, error } = await supabase.from('videos').insert(payload).select('id, title')

  if (error) {
    console.error('[createVideoFromUpload] Supabase insert error:', error)
    throw new Error(`Database error: ${error.message} (code: ${error.code})`)
  }

  console.log('[createVideoFromUpload] insert succeeded, row:', data?.[0])

  revalidatePath('/admin/videos')
  revalidatePath('/dashboard')
}

export async function updateVideo(videoId: string, formData: FormData) {
  const { supabase } = await requireAdmin()

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const url = formData.get('url') as string
  const thumbnail_url = formData.get('thumbnail_url') as string
  const durationRaw = formData.get('duration') as string
  const duration = durationRaw ? parseInt(durationRaw, 10) : null
  const sub_category = formData.get('sub_category') as string

  if (!title?.trim() || !url?.trim()) throw new Error('Title and URL are required')

  await supabase
    .from('videos')
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      url: url.trim(),
      thumbnail_url: thumbnail_url?.trim() || null,
      duration: duration && !isNaN(duration) ? duration : null,
      sub_category: sub_category?.trim() || null,
    })
    .eq('id', videoId)

  revalidatePath('/admin/videos')
  redirect('/admin/videos')
}

export async function deleteVideo(videoId: string) {
  const { supabase } = await requireAdmin()

  // Fetch the video's stored URLs before deleting the DB row
  const { data: video } = await supabase
    .from('videos')
    .select('url, thumbnail_url')
    .eq('id', videoId)
    .single<{ url: string; thumbnail_url: string | null }>()

  // Delete associated DB rows first
  await supabase.from('video_watch_events').delete().eq('video_id', videoId)
  await supabase.from('progress').delete().eq('video_id', videoId)
  await supabase.from('assignments').delete().eq('video_id', videoId)
  await supabase.from('videos').delete().eq('id', videoId)

  // Delete files from R2 (errors are logged, not thrown)
  if (video) {
    await deleteR2Files([video.url, video.thumbnail_url])
  }

  revalidatePath('/admin/videos')
  revalidatePath('/admin')
}

// ── Video ordering (admin) ────────────────────────────────────────────────

export async function reorderVideos(
  updates: {
    id: string
    sort_order: number
    sub_category_id: string | null
    sub_category: string | null
  }[]
) {
  const { supabase } = await requireAdmin()

  if (updates.length === 0) return

  for (const u of updates) {
    const { error } = await supabase
      .from('videos')
      .update({
        sort_order: u.sort_order,
        sub_category_id: u.sub_category_id,
        sub_category: u.sub_category,
      })
      .eq('id', u.id)
    if (error) {
      console.error('[reorderVideos] error:', error.message)
      throw new Error(error.message)
    }
  }
  // No revalidatePath — client maintains order optimistically.
}

// ── Assignments (admin) ───────────────────────────────────────────────────

export async function createAssignment(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const video_id = formData.get('video_id') as string
  const user_ids = formData.getAll('user_ids') as string[]
  const due_date = (formData.get('due_date') as string) || null

  console.log('[createAssignment] called — video_id:', video_id, '| user_ids:', user_ids, '| due_date:', due_date)

  if (!video_id || user_ids.length === 0) {
    throw new Error('Video and at least one employee required')
  }

  // ── Step 1: find which of the requested user_ids are already assigned ──
  const { data: existing, error: existingError } = await supabase
    .from('assignments')
    .select('user_id')
    .eq('video_id', video_id)
    .in('user_id', user_ids)

  console.log('[createAssignment] existing assignments check — data:', existing, '| error:', existingError)

  const alreadyAssigned = new Set((existing ?? []).map((r: { user_id: string }) => r.user_id))
  const newUserIds = user_ids.filter((id) => !alreadyAssigned.has(id))

  console.log('[createAssignment] already assigned:', [...alreadyAssigned], '| new to insert:', newUserIds)

  // ── Step 2: insert only the genuinely new assignments ──
  if (newUserIds.length > 0) {
    const rows = newUserIds.map((uid) => ({
      video_id,
      user_id: uid,
      assigned_by: user.id,
      assigned_at: new Date().toISOString(),
      due_date,
    }))

    console.log('[createAssignment] inserting rows:', JSON.stringify(rows))

    const { data: insertedRows, error: insertError } = await supabase
      .from('assignments')
      .insert(rows)
      .select('user_id')

    console.log('[createAssignment] insert result — data:', insertedRows, '| error:', insertError)

    if (insertError) {
      console.error('[createAssignment] INSERT FAILED:', insertError.message, insertError.code, insertError.details)
      throw new Error(`Failed to save assignments: ${insertError.message}`)
    }

    // ── Step 3: send emails for newly inserted employees ──
    const hdrs = await headers()
    const host = hdrs.get('host') ?? 'localhost:3000'
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? `${proto}://${host}`

    console.log('[createAssignment] baseUrl:', baseUrl)

    const [{ data: videoData, error: videoError }, { data: employees, error: empError }] = await Promise.all([
      supabase
        .from('videos')
        .select('id,title,description')
        .eq('id', video_id)
        .single<{ id: string; title: string; description: string | null }>(),
      supabase
        .from('profiles')
        .select('id,email,full_name')
        .in('id', newUserIds),
    ])

    console.log('[createAssignment] video fetch — data:', videoData, '| error:', videoError)
    console.log('[createAssignment] employees fetch — data:', employees, '| error:', empError)

    if (videoData && employees && employees.length > 0) {
      const typedEmployees = employees as { id: string; email: string; full_name: string | null }[]
      for (const emp of typedEmployees) {
        console.log('[createAssignment] sending email to:', emp.email)
        try {
          await sendAssignmentEmail({
            to: emp.email,
            employeeName: emp.full_name ?? emp.email,
            videoTitle: videoData.title,
            videoDescription: videoData.description,
            dueDate: due_date,
            watchUrl: `${baseUrl}/watch/${videoData.id}`,
          })
          console.log('[createAssignment] email sent OK to:', emp.email)
        } catch (emailErr) {
          console.error('[createAssignment] email FAILED for', emp.email, ':', emailErr)
          // Don't throw — a failed email must not roll back a successful assignment
        }
      }
    } else {
      console.warn('[createAssignment] skipping emails — video or employees not found')
    }
  } else {
    console.log('[createAssignment] all user_ids were already assigned — nothing inserted, no emails sent')
  }

  revalidatePath('/admin')
  revalidatePath('/admin/assign')
  // No redirect() — called from a client event handler; the client handles the
  // success state. Using redirect() here throws NEXT_REDIRECT which the
  // try/catch in AssignForm would surface as a visible error.
}

export async function deleteAssignment(assignmentId: string) {
  const { supabase } = await requireAdmin()
  await supabase.from('assignments').delete().eq('id', assignmentId)
  revalidatePath('/admin/assign')
  revalidatePath('/admin')
}

// ── Quizzes (admin) — JSONB schema ────────────────────────────────────────

export type QuizPayload = {
  passing_score: number
  questions: QuizQuestion[]
}

export async function saveQuiz(videoId: string, payload: QuizPayload) {
  const { supabase } = await requireAdmin()

  // Delete existing quiz for this video (cascade deletes attempts)
  await supabase.from('quizzes').delete().eq('video_id', videoId)

  const { error } = await supabase.from('quizzes').insert({
    video_id: videoId,
    questions: payload.questions,
    passing_score: payload.passing_score,
    updated_at: new Date().toISOString(),
  })

  if (error) throw new Error(error.message ?? 'Failed to save quiz')

  revalidatePath(`/admin/videos/${videoId}/quiz`)
  revalidatePath(`/watch/${videoId}`)
}

export async function deleteQuiz(quizId: string, videoId: string) {
  const { supabase } = await requireAdmin()
  await supabase.from('quizzes').delete().eq('id', quizId)
  revalidatePath(`/admin/videos/${videoId}/quiz`)
  revalidatePath(`/watch/${videoId}`)
}

// ── Quiz attempts (employee) — JSONB ─────────────────────────────────────

export async function submitQuizAttempt(
  quizId: string,
  videoId: string,
  answers: Record<number, QuizSubmittedAnswer>
) {
  const { supabase, user } = await getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('questions, passing_score')
    .eq('id', quizId)
    .single<{ questions: QuizQuestion[]; passing_score: number }>()

  if (!quiz || !quiz.questions.length) throw new Error('Quiz not found')

  let correct = 0
  const storedAnswers: StoredAnswer[] = quiz.questions.map((q, qi) => {
    const answer = answers[qi]
    const type = quizQuestionType(q)
    const options = q.options ?? []

    // ── Single-choice types (multiple_choice, true_false) ─────────────────
    // Legacy 'image_question' is normalized to 'multiple_choice' upstream.
    if (type === 'multiple_choice' || type === 'true_false') {
      const selectedIndex = typeof answer === 'number' ? answer : -1
      const chosenOpt = options[selectedIndex]
      const correctOpt = options.find((o) => o.is_correct)
      const isCorrect = !!chosenOpt?.is_correct
      if (isCorrect) correct++
      return {
        question_text: q.question_text,
        chosen: chosenOpt?.option_text ?? '(no answer)',
        correct: correctOpt?.option_text ?? '?',
        is_correct: isCorrect,
      }
    }

    // ── Multiple-select: all and only correct options must be chosen ──────
    if (type === 'multiple_select') {
      const picked = Array.isArray(answer) ? (answer as number[]) : []
      const pickedSet = new Set(picked)
      // Correct iff each option's selected-state matches its is_correct flag
      const isCorrect = options.length > 0 && options.every((o, i) => pickedSet.has(i) === !!o.is_correct)
      if (isCorrect) correct++
      const chosenTexts = picked
        .map((i) => options[i]?.option_text)
        .filter((t): t is string => !!t)
      const correctTexts = options.filter((o) => o.is_correct).map((o) => o.option_text)
      return {
        question_text: q.question_text,
        chosen: chosenTexts.length ? chosenTexts.join(', ') : '(no answer)',
        correct: correctTexts.length ? correctTexts.join(', ') : '?',
        is_correct: isCorrect,
      }
    }

    // ── Short answer: case-insensitive, whitespace-collapsed compare against
    //    ANY of the accepted answers ───────────────────────────────────────
    if (type === 'short_answer') {
      const given = typeof answer === 'string' ? answer : ''
      const accepted = quizAcceptedAnswers(q)
      const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
      const normGiven = norm(given)
      const isCorrect = normGiven.length > 0 && accepted.some((a) => norm(a) === normGiven)
      if (isCorrect) correct++
      return {
        question_text: q.question_text,
        chosen: given || '(no answer)',
        // Show all accepted answers, joined, so the admin can see what was acceptable
        correct: accepted.length > 0 ? accepted.join(' / ') : '?',
        is_correct: isCorrect,
      }
    }

    // Unknown type — treat as incorrect
    return {
      question_text: q.question_text,
      chosen: '(no answer)',
      correct: '?',
      is_correct: false,
    }
  })

  const score = Math.round((correct / quiz.questions.length) * 100)
  const passed = score >= quiz.passing_score

  const { error: insertError } = await supabase.from('quiz_attempts').insert({
    user_id: user.id,
    video_id: videoId,
    quiz_id: quizId,
    score,
    passed,
    answers: storedAnswers,
    taken_at: new Date().toISOString(),
  })

  if (insertError) {
    throw new Error(`Failed to save quiz attempt: ${insertError.message}`)
  }

  if (passed) {
    // Sync the progress row with the pass result. Either updates the existing
    // row (setting quiz_passed and confirming completed/percent) or creates
    // a fresh row with completed = true and quiz_passed = true.
    const { error: progressError } = await supabase.from('progress').upsert(
      {
        user_id: user.id,
        video_id: videoId,
        percent_watched: 100,
        completed: true,
        quiz_passed: true,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,video_id' }
    )
    if (progressError) {
      console.error('[submitQuizAttempt] progress sync error:', progressError.message)
      throw new Error(`Failed to sync progress: ${progressError.message}`)
    }
  } else {
    // Failed → reset video progress so employee must rewatch before retaking.
    // Also clear quiz_passed so the two tables stay in sync.
    await supabase.from('progress').upsert(
      {
        user_id: user.id,
        video_id: videoId,
        percent_watched: 0,
        completed: false,
        quiz_passed: false,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,video_id' }
    )
  }

  return { score, passed, total: quiz.questions.length, correct }
}

// ── Category management (admin) ───────────────────────────────────────────

export async function createCategory(name: string) {
  const { supabase } = await requireAdmin()

  const { data: existing } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single<{ sort_order: number }>()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim(), sort_order: nextOrder })
    .select()
    .single<Category>()

  if (error) throw new Error(error.message)

  revalidatePath('/admin/videos')
  revalidatePath('/videos')
  return data
}

export async function updateCategory(id: string, name: string) {
  const { supabase } = await requireAdmin()

  await supabase.from('categories').update({ name: name.trim() }).eq('id', id)
  // Keep text field in sync on videos
  await supabase.from('videos').update({ category: name.trim() }).eq('category_id', id)

  revalidatePath('/admin/videos')
  revalidatePath('/videos')
  revalidatePath('/dashboard')
}

export async function deleteCategory(id: string) {
  const { supabase } = await requireAdmin()

  // Unlink videos before deleting (FK ON DELETE SET NULL handles category_id,
  // but we also clear text fields and sub_category_id)
  await supabase
    .from('videos')
    .update({ category: null, sub_category: null, sub_category_id: null })
    .eq('category_id', id)

  // Delete category — cascades to sub_categories
  await supabase.from('categories').delete().eq('id', id)

  revalidatePath('/admin/videos')
  revalidatePath('/videos')
  revalidatePath('/dashboard')
}

// ── Sub-category management (admin) ──────────────────────────────────────

export async function createSubCategory(categoryId: string, name: string) {
  const { supabase } = await requireAdmin()

  const { data: existing } = await supabase
    .from('sub_categories')
    .select('sort_order')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single<{ sort_order: number }>()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('sub_categories')
    .insert({ category_id: categoryId, name: name.trim(), sort_order: nextOrder })
    .select()
    .single<SubCategory>()

  if (error) throw new Error(error.message)

  revalidatePath('/admin/videos')
  revalidatePath('/videos')
  return data
}

export async function updateSubCategory(id: string, name: string) {
  const { supabase } = await requireAdmin()

  await supabase.from('sub_categories').update({ name: name.trim() }).eq('id', id)
  // Keep text field in sync on videos
  await supabase.from('videos').update({ sub_category: name.trim() }).eq('sub_category_id', id)

  revalidatePath('/admin/videos')
  revalidatePath('/videos')
}

export async function deleteSubCategory(id: string) {
  const { supabase } = await requireAdmin()

  // Unlink videos (FK ON DELETE SET NULL handles sub_category_id, clear text too)
  await supabase
    .from('videos')
    .update({ sub_category: null })
    .eq('sub_category_id', id)

  await supabase.from('sub_categories').delete().eq('id', id)

  revalidatePath('/admin/videos')
  revalidatePath('/videos')
}

// ── Video metadata edit (admin) ───────────────────────────────────────────

export async function updateVideoMetadata(
  videoId: string,
  data: {
    title: string
    description: string | null
    categoryId: string | null
    categoryName: string | null
    subCategoryId: string | null
    subCategoryName: string | null
    thumbnailUrl: string | null
  }
) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('videos')
    .update({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      thumbnail_url: data.thumbnailUrl,
      category_id: data.categoryId,
      category: data.categoryName,
      sub_category_id: data.subCategoryId,
      sub_category: data.subCategoryName,
    })
    .eq('id', videoId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/videos')
  revalidatePath('/dashboard')
  revalidatePath('/videos')
}

// ── Learning Paths (admin) ────────────────────────────────────────────────

export async function createLearningPath(data: {
  name: string
  description: string | null
  isRequired: boolean
}) {
  const { supabase, user } = await requireAdmin()

  const { data: row, error } = await supabase
    .from('learning_paths')
    .insert({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      is_required: data.isRequired,
      created_by: user.id,
    })
    .select()
    .single<{ id: string }>()

  if (error || !row) throw new Error(error?.message ?? 'Failed to create path')

  revalidatePath('/admin/paths')
  return row
}

export async function updateLearningPath(
  pathId: string,
  data: { name: string; description: string | null; isRequired: boolean }
) {
  const { supabase } = await requireAdmin()

  await supabase
    .from('learning_paths')
    .update({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      is_required: data.isRequired,
    })
    .eq('id', pathId)

  revalidatePath('/admin/paths')
  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
}

export async function deleteLearningPath(pathId: string) {
  const { supabase } = await requireAdmin()
  await supabase.from('learning_paths').delete().eq('id', pathId)
  revalidatePath('/admin/paths')
  revalidatePath('/paths')
  revalidatePath('/dashboard')
}

export async function addVideoToPath(pathId: string, videoId: string) {
  const { supabase } = await requireAdmin()

  // Use maybeSingle so 0 rows returns { data: null, error: null } without a spurious error.
  const { data: existing, error: readError } = await supabase
    .from('learning_path_items')
    .select('sort_order')
    .eq('path_id', pathId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()

  if (readError) {
    console.error('[addVideoToPath] read error:', readError.message)
    throw new Error(`Failed to read existing path items: ${readError.message}`)
  }

  const nextOrder = (existing?.sort_order ?? -1) + 1

  const { data: inserted, error: insertError } = await supabase
    .from('learning_path_items')
    .insert({
      path_id: pathId,
      video_id: videoId,
      sort_order: nextOrder,
    })
    .select()
    .single<{ id: string }>()

  if (insertError) {
    console.error('[addVideoToPath] insert error:', insertError.message, insertError.code)
    throw new Error(`Failed to add video to path: ${insertError.message}`)
  }

  console.log('[addVideoToPath] inserted item id:', inserted?.id, 'for path:', pathId, 'video:', videoId)

  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
}

export async function removeVideoFromPath(pathId: string, videoId: string) {
  const { supabase } = await requireAdmin()
  await supabase
    .from('learning_path_items')
    .delete()
    .eq('path_id', pathId)
    .eq('video_id', videoId)

  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
}

export async function reorderPathItems(
  pathId: string,
  updates: { id: string; sort_order: number }[]
) {
  const { supabase } = await requireAdmin()
  for (const u of updates) {
    const { error } = await supabase
      .from('learning_path_items')
      .update({ sort_order: u.sort_order })
      .eq('id', u.id)
    if (error) throw new Error(error.message)
  }
  // No revalidate — client maintains optimistic order
}

export async function assignLearningPath(pathId: string, userIds: string[]) {
  const { supabase, user } = await requireAdmin()

  console.log('[assignLearningPath] pathId:', pathId, 'userIds:', userIds)

  if (userIds.length === 0) {
    console.log('[assignLearningPath] no user ids provided')
    return { inserted: 0 }
  }

  const { data: existing, error: readError } = await supabase
    .from('learning_path_assignments')
    .select('user_id')
    .eq('path_id', pathId)
    .in('user_id', userIds)

  if (readError) {
    console.error('[assignLearningPath] read error:', readError.message)
    throw new Error(`Failed to read existing assignments: ${readError.message}`)
  }

  const alreadyAssigned = new Set((existing ?? []).map((r: { user_id: string }) => r.user_id))
  const newIds = userIds.filter((id) => !alreadyAssigned.has(id))

  console.log('[assignLearningPath] already assigned:', [...alreadyAssigned], '| to insert:', newIds)

  if (newIds.length === 0) return { inserted: 0 }

  const rows = newIds.map((uid) => ({
    path_id: pathId,
    user_id: uid,
    assigned_by: user.id,
    assigned_at: new Date().toISOString(),
  }))

  const { data: inserted, error } = await supabase
    .from('learning_path_assignments')
    .insert(rows)
    .select('id')

  if (error) {
    console.error('[assignLearningPath] insert error:', error.message, error.code, error.details)
    throw new Error(`Failed to assign path: ${error.message}`)
  }

  console.log('[assignLearningPath] inserted rows:', inserted?.length ?? 0)

  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
  revalidatePath('/dashboard')

  return { inserted: inserted?.length ?? 0 }
}

// Fresh lookup of the next video in a learning path. Called by the client
// when clicking "Next Video" so stale server-rendered props don't mislead.
export async function getNextVideoInPath(pathId: string, currentVideoId: string) {
  const { supabase, user } = await getUser()
  if (!user) return { error: 'Unauthorized' as const }

  const { data: items, error } = await supabase
    .from('learning_path_items')
    .select('id, video_id, sort_order')
    .eq('path_id', pathId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[getNextVideoInPath] query error:', error.message)
    return { error: error.message }
  }

  const typedItems = (items ?? []) as { id: string; video_id: string; sort_order: number }[]
  console.log(
    '[getNextVideoInPath] pathId:', pathId,
    '| currentVideoId:', currentVideoId,
    '| items:', typedItems.map((i) => ({ video_id: i.video_id, sort_order: i.sort_order }))
  )

  const currentIndex = typedItems.findIndex((i) => i.video_id === currentVideoId)
  console.log('[getNextVideoInPath] currentIndex:', currentIndex, '| total:', typedItems.length)

  if (currentIndex === -1) {
    console.warn('[getNextVideoInPath] current video not in path')
    return { nextVideoId: null, reason: 'not-in-path' as const }
  }
  if (currentIndex >= typedItems.length - 1) {
    console.log('[getNextVideoInPath] current video is the last in the path')
    return { nextVideoId: null, reason: 'last-video' as const }
  }

  const next = typedItems[currentIndex + 1]
  console.log('[getNextVideoInPath] next video_id:', next.video_id)
  return { nextVideoId: next.video_id }
}

// Called by the employee client when they complete the last video in a path.
// Upserts completed_at on the assignment so required paths (no explicit
// assignment row) are also tracked.
export async function markPathCompleted(pathId: string) {
  const { supabase, user } = await getUser()
  if (!user) return

  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('learning_path_assignments')
    .select('id, completed_at')
    .eq('path_id', pathId)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; completed_at: string | null }>()

  if (existing) {
    if (existing.completed_at) return { alreadyCompleted: true }
    const { error } = await supabase
      .from('learning_path_assignments')
      .update({ completed_at: now })
      .eq('id', existing.id)
    if (error) {
      console.error('[markPathCompleted] update error:', error.message)
      return { error: error.message }
    }
  } else {
    const { error } = await supabase.from('learning_path_assignments').insert({
      path_id: pathId,
      user_id: user.id,
      assigned_at: now,
      completed_at: now,
    })
    if (error) {
      console.error('[markPathCompleted] insert error:', error.message)
      return { error: error.message }
    }
  }

  revalidatePath('/paths')
  revalidatePath(`/paths/${pathId}`)
  return { completed: true }
}

export async function unassignLearningPath(pathId: string, userId: string) {
  const { supabase } = await requireAdmin()
  await supabase
    .from('learning_path_assignments')
    .delete()
    .eq('path_id', pathId)
    .eq('user_id', userId)

  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
  revalidatePath('/dashboard')
}

// ── Documents (admin) ─────────────────────────────────────────────────────

export async function createDocument(data: {
  title: string
  description: string | null
  fileUrl: string
  fileType: string | null
  fileSize: number | null
  categoryId: string | null
}) {
  const { supabase, user } = await requireAdmin()

  const { data: row, error } = await supabase
    .from('documents')
    .insert({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      file_url: data.fileUrl,
      file_type: data.fileType,
      file_size: data.fileSize,
      category_id: data.categoryId,
      uploaded_by: user.id,
    })
    .select()
    .single<{ id: string }>()

  if (error || !row) throw new Error(error?.message ?? 'Failed to create document')

  revalidatePath('/admin/documents')
  revalidatePath('/documents')
  return row
}

export async function updateDocument(
  documentId: string,
  data: { title: string; description: string | null; categoryId: string | null }
) {
  const { supabase } = await requireAdmin()
  await supabase
    .from('documents')
    .update({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      category_id: data.categoryId,
    })
    .eq('id', documentId)

  revalidatePath('/admin/documents')
  revalidatePath('/documents')
}

export async function deleteDocument(documentId: string) {
  const { supabase } = await requireAdmin()

  // Fetch file URL before deleting, to clean up R2
  const { data: doc } = await supabase
    .from('documents')
    .select('file_url')
    .eq('id', documentId)
    .single<{ file_url: string }>()

  await supabase.from('documents').delete().eq('id', documentId)

  if (doc?.file_url) {
    await deleteR2Files([doc.file_url])
  }

  revalidatePath('/admin/documents')
  revalidatePath('/documents')
}

export async function recordDocumentView(documentId: string) {
  const { supabase, user } = await getUser()
  if (!user) return

  await supabase.from('document_views').insert({
    user_id: user.id,
    document_id: documentId,
    viewed_at: new Date().toISOString(),
  })
}

// ── Learning path documents (attach/detach) ───────────────────────────────

export async function addDocumentToPath(pathId: string, documentId: string) {
  const { supabase } = await requireAdmin()

  const { data: existing } = await supabase
    .from('learning_path_documents')
    .select('sort_order')
    .eq('path_id', pathId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single<{ sort_order: number }>()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  const { error } = await supabase.from('learning_path_documents').insert({
    path_id: pathId,
    document_id: documentId,
    sort_order: nextOrder,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
}

export async function removeDocumentFromPath(pathId: string, documentId: string) {
  const { supabase } = await requireAdmin()
  await supabase
    .from('learning_path_documents')
    .delete()
    .eq('path_id', pathId)
    .eq('document_id', documentId)

  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
}

// ── Learning path: full create/edit in one action ─────────────────────────

// Replaces the old multi-step createLearningPath + addVideoToPath + assignLearningPath
// flow. Takes the complete form state (name, description, ordered video IDs,
// employee IDs) and persists everything in one call. Sends email to newly
// assigned employees.
export async function savePathWithDetails(data: {
  pathId?: string
  name: string
  description: string
  videoIds: string[]
  employeeIds: string[]
}) {
  const { supabase, user } = await requireAdmin()

  let pathId = data.pathId
  let newAssigneeIds: string[]

  if (pathId) {
    // ── Edit existing path ────────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('learning_paths')
      .update({
        name: data.name.trim(),
        description: data.description.trim() || null,
      })
      .eq('id', pathId)
    if (updateErr) throw new Error(`Failed to update path: ${updateErr.message}`)

    // Work out which employees are newly assigned (so we only email them)
    const { data: existing } = await supabase
      .from('learning_path_assignments')
      .select('user_id')
      .eq('path_id', pathId)
    const existingIds = new Set((existing ?? []).map((r: { user_id: string }) => r.user_id))
    newAssigneeIds = data.employeeIds.filter((id) => !existingIds.has(id))

    // Replace items and assignments wholesale
    await supabase.from('learning_path_items').delete().eq('path_id', pathId)
    await supabase.from('learning_path_assignments').delete().eq('path_id', pathId)
  } else {
    // ── Create new path ───────────────────────────────────────────────
    const { data: inserted, error: insertErr } = await supabase
      .from('learning_paths')
      .insert({
        name: data.name.trim(),
        description: data.description.trim() || null,
        created_by: user.id,
      })
      .select('id')
      .single<{ id: string }>()
    if (insertErr || !inserted) {
      throw new Error(`Failed to create path: ${insertErr?.message ?? 'unknown error'}`)
    }
    pathId = inserted.id
    newAssigneeIds = data.employeeIds
  }

  // Insert items in order
  if (data.videoIds.length > 0) {
    const rows = data.videoIds.map((vid, i) => ({
      path_id: pathId,
      video_id: vid,
      sort_order: i,
    }))
    const { error } = await supabase.from('learning_path_items').insert(rows)
    if (error) throw new Error(`Failed to save videos: ${error.message}`)
  }

  // Insert all assignments (including previously-assigned, since we wiped)
  if (data.employeeIds.length > 0) {
    const now = new Date().toISOString()
    const rows = data.employeeIds.map((uid) => ({
      path_id: pathId,
      user_id: uid,
      assigned_by: user.id,
      assigned_at: now,
    }))
    const { error } = await supabase.from('learning_path_assignments').insert(rows)
    if (error) throw new Error(`Failed to assign employees: ${error.message}`)
  }

  // Email newly-assigned employees
  if (newAssigneeIds.length > 0) {
    const { data: empRows } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', newAssigneeIds)

    if (empRows && empRows.length > 0) {
      const hdrs = await headers()
      const host = hdrs.get('host') ?? 'localhost:3000'
      const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? `${proto}://${host}`
      const pathsUrl = `${baseUrl}/paths`

      for (const emp of empRows as { id: string; email: string; full_name: string | null }[]) {
        try {
          await sendPathAssignmentEmail({
            to: emp.email,
            employeeName: emp.full_name ?? emp.email,
            pathName: data.name.trim(),
            pathDescription: data.description.trim() || null,
            videoCount: data.videoIds.length,
            pathsUrl,
          })
        } catch (e) {
          console.error('[savePathWithDetails] email failed for', emp.email, ':', e)
        }
      }
    }
  }

  revalidatePath('/admin/paths')
  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
  revalidatePath('/dashboard')

  return { pathId }
}

// ── Job roles / groups (admin) ────────────────────────────────────────────

export async function createJobRole(data: { name: string; description: string | null }) {
  const { supabase } = await requireAdmin()
  const { data: row, error } = await supabase
    .from('roles')
    .insert({
      name: data.name.trim(),
      description: data.description?.trim() || null,
    })
    .select()
    .single<{ id: string }>()
  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
  revalidatePath('/admin/assign')
  revalidatePath('/admin/paths')
  return row
}

export async function updateJobRole(
  id: string,
  data: { name: string; description: string | null }
) {
  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('roles')
    .update({
      name: data.name.trim(),
      description: data.description?.trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
  revalidatePath('/admin/assign')
  revalidatePath('/admin/paths')
}

export async function deleteJobRole(id: string) {
  const { supabase } = await requireAdmin()
  // ON DELETE CASCADE on user_roles drops memberships automatically
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
  revalidatePath('/admin/assign')
  revalidatePath('/admin/paths')
}

// Replace a user's full set of job roles with the given list
export async function setUserJobRoles(userId: string, roleIds: string[]) {
  const { supabase } = await requireAdmin()

  await supabase.from('user_roles').delete().eq('user_id', userId)

  if (roleIds.length > 0) {
    const rows = roleIds.map((rid) => ({ user_id: userId, role_id: rid }))
    const { error } = await supabase.from('user_roles').insert(rows)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/users')
}

// ── User management (admin) ───────────────────────────────────────────────

export async function setUserActive(userId: string, active: boolean) {
  const { supabase, user } = await requireAdmin()
  if (userId === user.id && !active) {
    throw new Error('You cannot deactivate your own account')
  }
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: active })
    .eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}

export async function updateUserProfile(
  userId: string,
  data: { full_name: string; role: 'admin' | 'employee' }
) {
  const { supabase, user } = await requireAdmin()
  if (userId === user.id && data.role !== 'admin') {
    throw new Error('You cannot demote your own account')
  }
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: data.full_name.trim() || null, role: data.role })
    .eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/users')
}

export async function createUserAccount(data: {
  email: string
  password: string
  fullName: string
  role: 'admin' | 'employee'
}) {
  await requireAdmin()

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // Create the auth user with email confirmation bypassed
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: data.email.trim(),
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.fullName.trim() },
  })
  if (createErr || !created.user) {
    throw new Error(createErr?.message ?? 'Failed to create user')
  }

  // Insert profile row (a DB trigger may also handle this — upsert to be safe)
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: created.user.id,
      email: data.email.trim(),
      full_name: data.fullName.trim() || null,
      role: data.role,
      is_active: true,
    },
    { onConflict: 'id' }
  )
  if (profileErr) {
    // Roll back the auth user so the admin can try again
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    throw new Error(`Failed to create profile: ${profileErr.message}`)
  }

  revalidatePath('/admin/users')
  return { id: created.user.id }
}

export async function deleteUserAccount(userId: string) {
  const { user } = await requireAdmin()
  if (userId === user.id) {
    throw new Error('You cannot delete your own account')
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // Delete the auth user — cascading FKs should remove related rows.
  // Also delete the profile row explicitly as a safety net.
  const { error: authErr } = await admin.auth.admin.deleteUser(userId)
  if (authErr) {
    console.error('[deleteUserAccount] auth delete error:', authErr.message)
    // Continue — we still want to clean up the profile row if it exists.
  }
  await admin.from('profiles').delete().eq('id', userId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}
