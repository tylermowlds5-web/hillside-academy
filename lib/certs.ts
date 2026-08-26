import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CertProgram, CertRequirement, CertAward, CertPageKind } from '@/lib/types'

// ── Certification state loader + server-side gating ──────────────────────
// Single source of truth for "which modules exist, which are complete, which
// are unlocked". EVERY cert surface must derive lock state from here:
// the catalog, the program overview, the module page's render, AND every
// submit action (lesson progress, quiz start, quiz submit) — so gating can
// never be bypassed by typing a URL or replaying a request. Never compute
// lock state in a component.
//
// CERT PROGRESS IS SELF-CONTAINED. A video module completes ONLY via
// cert_lesson_progress (watched inside the cert area) — everyday HU progress
// on the same video counts for NOTHING here. If the module has a question
// bank, a passed cert_quiz_attempts row is also required.
//
// Completion per module kind:
// - video: cert_lesson_progress.completed AND (has bank → passed attempt)
// - quiz:  any passed standalone_quiz_attempts row (HU-linked by design —
//          the requirement explicitly points at an HU standalone quiz)
// - path:  every video in the learning path completed in HU (HU-linked by
//          design — the requirement explicitly points at an HU path)
// A module is unlocked iff ALL prior modules (by sort_order) are completed.
//
// The question bank and attempt tables are admin-only under RLS (they hold
// answer keys), so this loader reads the user's cert state through the
// service-role client, scoped to the userId the caller derived from the
// session. Catalog-type tables are read with the caller's session client.

export type CertModuleKind = 'video' | 'quiz' | 'path' | 'lesson'

export type CertModule = {
  requirementId: string
  kind: CertModuleKind
  title: string
  // Approximate length in minutes (video duration). Null when unknown.
  minutes: number | null
  completed: boolean
  unlocked: boolean
  // Per-module quiz settings (meaningful when hasQuizBank)
  hasQuizBank: boolean
  quizPassScore: number
  quizDrawCount: number
  quizPassed: boolean
  quizBestScore: number | null
  quizAttemptCount: number
  // Cert-native lesson watch state (video modules)
  lessonCompleted: boolean
  lessonPercent: number
  lessonSeconds: number
  // Target details (exactly one group is set, mirroring cert_requirements)
  videoId?: string
  videoUrl?: string
  videoThumbnailUrl?: string | null
  quizId?: string
  quizQuestionCount?: number
  pathId?: string
  pathVideoCount?: number
  pathCompletedCount?: number
  // Text/image lesson content
  lessonBody?: string | null
  lessonImageUrl?: string | null
  // Ordered pages (lesson modules). Present and non-empty = paged lesson:
  // the module's content completes when every page completes, in order.
  pages?: { id: string; kind: CertPageKind; title: string | null; videoId: string | null; completed: boolean }[]
}

export type CertProgramStatus = 'not_started' | 'in_progress' | 'certified' | 'expired'

export type CertProgramState = {
  program: CertProgram
  modules: CertModule[]
  completedCount: number
  status: CertProgramStatus
  award: CertAward | null
  // Whether an admin has assigned this cert to the user (informational).
  assigned: boolean
  // True while a renewal cycle is open (renewal started, not yet re-earned).
  renewalOpen: boolean
}

type VideoLite = { id: string; title: string; url: string; duration: number | null; thumbnail_url: string | null }
type QuizLite = { id: string; title: string; questions: unknown[] }
type PathLite = { id: string; name: string }
type LessonLite = { requirement_id: string; percent_watched: number; actual_seconds_watched: number; completed: boolean }
type AttemptLite = { requirement_id: string; score: number | null; passed: boolean | null; submitted_at: string | null }

function awardActive(award: CertAward): boolean {
  if (award.revoked_at) return false
  if (award.expires_at && new Date(award.expires_at).getTime() < Date.now()) return false
  return true
}

// Loads the full cert state for every ACTIVE program, for one user, in a
// fixed set of batched queries (no per-program N+1). Programs are few, so
// the single-program pages just pick theirs out of this.
export async function loadCertStates(
  supabase: SupabaseClient,
  userId: string
): Promise<CertProgramState[]> {
  const admin = createAdminClient()

  const [{ data: programs }, { data: awards }, { data: assignments }] = await Promise.all([
    supabase
      .from('cert_programs')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .returns<CertProgram[]>(),
    supabase.from('cert_awards').select('*').eq('user_id', userId).returns<CertAward[]>(),
    supabase
      .from('cert_assignments')
      .select('program_id')
      .eq('user_id', userId)
      .returns<{ program_id: string }[]>(),
  ])

  if (!programs || programs.length === 0) return []

  const { data: requirements } = await supabase
    .from('cert_requirements')
    .select('*')
    .in('program_id', programs.map((p) => p.id))
    .order('sort_order', { ascending: true })
    .returns<CertRequirement[]>()

  const reqs = requirements ?? []
  const reqIds = reqs.map((r) => r.id)
  const directVideoIds = [...new Set(reqs.map((r) => r.video_id).filter(Boolean))] as string[]
  const quizIds = [...new Set(reqs.map((r) => r.standalone_quiz_id).filter(Boolean))] as string[]
  const pathIds = [...new Set(reqs.map((r) => r.path_id).filter(Boolean))] as string[]

  // Path requirements complete when all their videos are complete in HU.
  const { data: pathItems } = pathIds.length
    ? await supabase
        .from('learning_path_items')
        .select('path_id, video_id')
        .in('path_id', pathIds)
        .returns<{ path_id: string; video_id: string }[]>()
    : { data: [] as { path_id: string; video_id: string }[] }

  const pathVideoIds = [...new Set((pathItems ?? []).map((i) => i.video_id))]

  const [videosRes, quizzesRes, pathsRes, pathProgressRes, passedAttemptsRes, lessonsRes, certAttemptsRes, bankRes, standaloneBankRes, pagesRes, pageProgressRes] =
    await Promise.all([
      directVideoIds.length
        ? supabase
            .from('videos')
            .select('id, title, url, duration, thumbnail_url')
            .in('id', directVideoIds)
            .returns<VideoLite[]>()
        : Promise.resolve({ data: [] as VideoLite[] }),
      quizIds.length
        ? supabase
            .from('standalone_quizzes')
            .select('id, title, questions')
            .in('id', quizIds)
            .returns<QuizLite[]>()
        : Promise.resolve({ data: [] as QuizLite[] }),
      pathIds.length
        ? supabase.from('learning_paths').select('id, name').in('id', pathIds).returns<PathLite[]>()
        : Promise.resolve({ data: [] as PathLite[] }),
      // HU progress is consulted ONLY for path modules (their completion is
      // defined by the HU path). Video modules never touch it.
      pathVideoIds.length
        ? supabase
            .from('progress')
            .select('video_id, completed')
            .eq('user_id', userId)
            .in('video_id', pathVideoIds)
            .returns<{ video_id: string; completed: boolean }[]>()
        : Promise.resolve({ data: [] as { video_id: string; completed: boolean }[] }),
      quizIds.length
        ? supabase
            .from('standalone_quiz_attempts')
            .select('quiz_id, taken_at')
            .eq('user_id', userId)
            .eq('passed', true)
            .in('quiz_id', quizIds)
            .returns<{ quiz_id: string; taken_at: string }[]>()
        : Promise.resolve({ data: [] as { quiz_id: string; taken_at: string }[] }),
      reqIds.length
        ? admin
            .from('cert_lesson_progress')
            .select('requirement_id, percent_watched, actual_seconds_watched, completed')
            .eq('user_id', userId)
            .in('requirement_id', reqIds)
            .returns<LessonLite[]>()
        : Promise.resolve({ data: [] as LessonLite[] }),
      reqIds.length
        ? admin
            .from('cert_quiz_attempts')
            .select('requirement_id, score, passed, submitted_at')
            .eq('user_id', userId)
            .in('requirement_id', reqIds)
            .returns<AttemptLite[]>()
        : Promise.resolve({ data: [] as AttemptLite[] }),
      reqIds.length
        ? admin
            .from('cert_question_groups')
            .select('requirement_id')
            .in('requirement_id', reqIds)
            .returns<{ requirement_id: string }[]>()
        : Promise.resolve({ data: [] as { requirement_id: string }[] }),
      // Standalone bank questions also make a module "have a quiz".
      reqIds.length
        ? admin
            .from('cert_questions')
            .select('requirement_id')
            .in('requirement_id', reqIds)
            .returns<{ requirement_id: string }[]>()
        : Promise.resolve({ data: [] as { requirement_id: string }[] }),
      // Lesson pages (metadata only — full content is fetched by the module page).
      reqIds.length
        ? supabase
            .from('cert_pages')
            .select('id, requirement_id, kind, video_id, title, sort_order')
            .in('requirement_id', reqIds)
            .order('sort_order')
            .returns<{ id: string; requirement_id: string; kind: CertPageKind; video_id: string | null; title: string | null; sort_order: number }[]>()
        : Promise.resolve({ data: [] as { id: string; requirement_id: string; kind: CertPageKind; video_id: string | null; title: string | null; sort_order: number }[] }),
      reqIds.length
        ? admin
            .from('cert_page_progress')
            .select('page_id, completed')
            .eq('user_id', userId)
            .returns<{ page_id: string; completed: boolean }[]>()
        : Promise.resolve({ data: [] as { page_id: string; completed: boolean }[] }),
    ])

  const videoById = new Map((videosRes.data ?? []).map((v) => [v.id, v]))
  const quizById = new Map((quizzesRes.data ?? []).map((q) => [q.id, q]))
  const pathById = new Map((pathsRes.data ?? []).map((p) => [p.id, p]))
  const huCompletedVideos = new Set(
    (pathProgressRes.data ?? []).filter((p) => p.completed).map((p) => p.video_id)
  )
  const passedHuAttempts = passedAttemptsRes.data ?? []
  const lessonByReq = new Map((lessonsRes.data ?? []).map((l) => [l.requirement_id, l]))
  const awardByProgram = new Map((awards ?? []).map((a) => [a.program_id, a]))
  const assignedPrograms = new Set((assignments ?? []).map((a) => a.program_id))
  const bankReqIds = new Set([
    ...(bankRes.data ?? []).map((b) => b.requirement_id),
    ...(standaloneBankRes.data ?? []).map((b) => b.requirement_id),
  ])
  const donePageIds = new Set(
    (pageProgressRes.data ?? []).filter((p) => p.completed).map((p) => p.page_id)
  )
  const pagesByReq = new Map<string, { id: string; kind: CertPageKind; video_id: string | null; title: string | null }[]>()
  for (const pg of pagesRes.data ?? []) {
    const list = pagesByReq.get(pg.requirement_id) ?? []
    list.push(pg)
    pagesByReq.set(pg.requirement_id, list)
  }

  const attemptsByReq = new Map<string, AttemptLite[]>()
  for (const a of certAttemptsRes.data ?? []) {
    const list = attemptsByReq.get(a.requirement_id) ?? []
    list.push(a)
    attemptsByReq.set(a.requirement_id, list)
  }

  const pathVideosByPath = new Map<string, string[]>()
  for (const item of pathItems ?? []) {
    const list = pathVideosByPath.get(item.path_id) ?? []
    list.push(item.video_id)
    pathVideosByPath.set(item.path_id, list)
  }

  return programs.map((program) => {
    const programReqs = reqs.filter((r) => r.program_id === program.id)
    const award = awardByProgram.get(program.id) ?? null

    // Renewal cycle cutoff: once a renewal has been started, attempts made
    // BEFORE it never count toward completion again — re-certifying means
    // re-taking everything. (Lesson progress is deleted at renewal start.)
    const cutoffMs = award?.renewal_started_at ? Date.parse(award.renewal_started_at) : null
    const afterCutoff = (ts: string | null) =>
      ts !== null && (cutoffMs === null || Date.parse(ts) > cutoffMs)

    let priorAllComplete = true
    const modules: CertModule[] = programReqs.map((r) => {
      const lesson = lessonByReq.get(r.id)
      const attempts = (attemptsByReq.get(r.id) ?? []).filter((a) => afterCutoff(a.submitted_at))
      const hasQuizBank = bankReqIds.has(r.id)
      const quizPassed = attempts.some((a) => a.passed === true)
      const scores = attempts.map((a) => a.score).filter((s): s is number => s !== null)

      const base = {
        requirementId: r.id,
        unlocked: priorAllComplete,
        hasQuizBank,
        quizPassScore: r.quiz_pass_score,
        quizDrawCount: r.quiz_draw_count,
        quizPassed,
        quizBestScore: scores.length ? Math.max(...scores) : null,
        quizAttemptCount: attempts.length,
        lessonCompleted: lesson?.completed ?? false,
        lessonPercent: lesson?.percent_watched ?? 0,
        lessonSeconds: lesson?.actual_seconds_watched ?? 0,
      }

      let mod: CertModule
      if (r.lesson_title) {
        // Lesson module. With pages, the content completes when EVERY page
        // completes (page progress is wiped on renewal like lesson
        // progress); without pages, legacy single-body mark-as-read.
        const modPages = (pagesByReq.get(r.id) ?? []).map((pg) => ({
          id: pg.id,
          kind: pg.kind,
          title: pg.title,
          videoId: pg.video_id,
          completed: donePageIds.has(pg.id),
        }))
        const contentDone =
          modPages.length > 0 ? modPages.every((pg) => pg.completed) : base.lessonCompleted
        mod = {
          ...base,
          lessonCompleted: contentDone,
          kind: 'lesson',
          title: r.lesson_title,
          minutes: null,
          completed: contentDone && (!hasQuizBank || quizPassed),
          lessonBody: r.lesson_body,
          lessonImageUrl: r.lesson_image_url,
          pages: modPages,
        }
      } else if (r.video_id) {
        const video = videoById.get(r.video_id)
        const completed = base.lessonCompleted && (!hasQuizBank || quizPassed)
        mod = {
          ...base,
          kind: 'video',
          title: video?.title ?? 'Video (removed)',
          minutes: video?.duration ? Math.max(1, Math.round(video.duration / 60)) : null,
          completed,
          videoId: r.video_id,
          videoUrl: video?.url,
          videoThumbnailUrl: video?.thumbnail_url ?? null,
        }
      } else if (r.standalone_quiz_id) {
        const quiz = quizById.get(r.standalone_quiz_id)
        mod = {
          ...base,
          kind: 'quiz',
          title: quiz?.title ?? 'Quiz (removed)',
          minutes: null,
          completed: passedHuAttempts.some(
            (a) => a.quiz_id === r.standalone_quiz_id && afterCutoff(a.taken_at)
          ),
          quizId: r.standalone_quiz_id,
          quizQuestionCount: Array.isArray(quiz?.questions) ? quiz.questions.length : 0,
        }
      } else {
        const path = r.path_id ? pathById.get(r.path_id) : undefined
        const vids = r.path_id ? (pathVideosByPath.get(r.path_id) ?? []) : []
        const done = vids.filter((v) => huCompletedVideos.has(v)).length
        mod = {
          ...base,
          kind: 'path',
          title: path?.name ?? 'Learning path (removed)',
          minutes: null,
          // An empty path can't be "completed" — treat as incomplete so a
          // misconfigured program blocks rather than silently certifies.
          completed: vids.length > 0 && done === vids.length,
          pathId: r.path_id ?? undefined,
          pathVideoCount: vids.length,
          pathCompletedCount: done,
        }
      }

      priorAllComplete = priorAllComplete && mod.completed
      return mod
    })

    const completedCount = modules.filter((m) => m.completed).length
    const renewalOpen = Boolean(
      award &&
        award.renewal_started_at &&
        Date.parse(award.renewal_started_at) > Date.parse(award.earned_at)
    )

    let status: CertProgramStatus
    if (award && awardActive(award)) status = 'certified'
    else if (award && award.expires_at && !award.revoked_at) status = 'expired'
    else if (completedCount > 0) status = 'in_progress'
    else status = 'not_started'

    return {
      program,
      modules,
      completedCount,
      status,
      award,
      assigned: assignedPrograms.has(program.id),
      renewalOpen,
    }
  })
}

// Single-program convenience wrapper. Returns null when the program doesn't
// exist or is inactive.
export async function loadProgramState(
  supabase: SupabaseClient,
  userId: string,
  programId: string
): Promise<CertProgramState | null> {
  const states = await loadCertStates(supabase, userId)
  return states.find((s) => s.program.id === programId) ?? null
}

// THE gate. Pages call this before rendering a module; every cert server
// action (lesson progress, quiz start, quiz submit) must call it again
// before recording anything. Returns the module only if it is unlocked for
// this user right now.
export async function requireUnlockedModule(
  supabase: SupabaseClient,
  userId: string,
  programId: string,
  requirementId: string
): Promise<{ state: CertProgramState; module: CertModule; index: number } | null> {
  const state = await loadProgramState(supabase, userId, programId)
  if (!state) return null
  const index = state.modules.findIndex((m) => m.requirementId === requirementId)
  if (index === -1) return null
  const mod = state.modules[index]
  if (!mod.unlocked) return null
  return { state, module: mod, index }
}

// Awards the cert when (and only when) every module is genuinely complete.
// This row is the official pass record (used later for raise eligibility):
// who passed which cert and when, with expiry derived from validity_months.
// Idempotent and conservative:
// - no-ops unless the program has modules and ALL are complete
// - no-ops if ANY award row already exists (active, expired, or revoked) —
//   earned_at must never be silently rewritten, and a revoked award must
//   never quietly resurrect; renewals are a deliberate future flow
// - unique(program_id, user_id) + ignoreDuplicates makes concurrent
//   completions (e.g. double submit) safe
// Writes via the service role: employees can't insert their own awards
// under RLS, so the server is the only author. Returns true when a new
// award was recorded.
export async function maybeAwardCert(
  supabase: SupabaseClient,
  userId: string,
  programId: string,
  preloadedState?: CertProgramState
): Promise<boolean> {
  const state = preloadedState ?? (await loadProgramState(supabase, userId, programId))
  if (!state || state.modules.length === 0) return false
  if (state.completedCount < state.modules.length) return false

  const earned = new Date()
  let expires: string | null = null
  if (state.program.validity_months) {
    const d = new Date(earned)
    d.setMonth(d.getMonth() + state.program.validity_months)
    expires = d.toISOString()
  }

  const admin = createAdminClient()

  // Renewal completion: the user re-took everything after the cycle cutoff
  // (completion above is cutoff-filtered), so re-stamp the same award row —
  // new earned_at closes the cycle (renewal_started_at is no longer newer).
  // Revoked awards never resurrect, and outside an open cycle an existing
  // award is never rewritten.
  if (state.award) {
    if (!state.renewalOpen || state.award.revoked_at) return false
    const { error } = await admin
      .from('cert_awards')
      .update({ earned_at: earned.toISOString(), expires_at: expires, awarded_by: null })
      .eq('id', state.award.id)
    if (error) {
      console.error('[maybeAwardCert] renewal update error:', error.message)
      return false
    }
    return true
  }

  const { error } = await admin.from('cert_awards').upsert(
    {
      program_id: programId,
      user_id: userId,
      awarded_by: null, // null = earned automatically by completing the program
      earned_at: earned.toISOString(),
      expires_at: expires,
    },
    { onConflict: 'program_id,user_id', ignoreDuplicates: true }
  )
  if (error) {
    console.error('[maybeAwardCert] upsert error:', error.message)
    return false
  }
  return true
}

// Progress shape for the CertTopBar dots.
export function topBarProgress(state: CertProgramState, currentIndex?: number) {
  const firstIncomplete = state.modules.findIndex((m) => !m.completed)
  return {
    total: state.modules.length,
    completed: state.completedCount,
    current:
      currentIndex !== undefined
        ? currentIndex + 1
        : firstIncomplete === -1
          ? undefined
          : firstIncomplete + 1,
  }
}
