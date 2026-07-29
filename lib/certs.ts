import type { SupabaseClient } from '@supabase/supabase-js'
import type { CertProgram, CertRequirement, CertAward } from '@/lib/types'

// ── Certification state loader + server-side gating ──────────────────────
// Single source of truth for "which modules exist, which are complete, which
// are unlocked". EVERY cert surface must derive lock state from here:
// the catalog, the program overview, the module page's render, AND any
// submit action (4b) — so gating can never be bypassed by typing a URL or
// replaying a request. Never compute lock state in a component.
//
// A "module" is a cert_requirements row. Completion per target type:
// - video:  progress.completed AND (video has quiz → progress.quiz_passed)
// - quiz:   any standalone_quiz_attempts row with passed = true
// - path:   every video in the learning path has progress.completed
// A module is unlocked iff ALL prior modules (by sort_order) are completed.

export type CertModuleKind = 'video' | 'quiz' | 'path'

export type CertModule = {
  requirementId: string
  kind: CertModuleKind
  title: string
  // Approximate length in minutes (video duration). Null when unknown.
  minutes: number | null
  completed: boolean
  unlocked: boolean
  // Target details (exactly one group is set, mirroring cert_requirements)
  videoId?: string
  videoThumbnailUrl?: string | null
  videoHasQuiz?: boolean
  quizId?: string
  quizQuestionCount?: number
  pathId?: string
  pathVideoCount?: number
  pathCompletedCount?: number
}

export type CertProgramStatus = 'not_started' | 'in_progress' | 'certified' | 'expired'

export type CertProgramState = {
  program: CertProgram
  modules: CertModule[]
  completedCount: number
  status: CertProgramStatus
  award: CertAward | null
}

type VideoLite = { id: string; title: string; duration: number | null; thumbnail_url: string | null }
type QuizLite = { id: string; title: string; questions: unknown[] }
type PathLite = { id: string; name: string }

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
  const [{ data: programs }, { data: awards }] = await Promise.all([
    supabase
      .from('cert_programs')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .returns<CertProgram[]>(),
    supabase.from('cert_awards').select('*').eq('user_id', userId).returns<CertAward[]>(),
  ])

  if (!programs || programs.length === 0) return []

  const { data: requirements } = await supabase
    .from('cert_requirements')
    .select('*')
    .in('program_id', programs.map((p) => p.id))
    .order('sort_order', { ascending: true })
    .returns<CertRequirement[]>()

  const reqs = requirements ?? []
  const directVideoIds = [...new Set(reqs.map((r) => r.video_id).filter(Boolean))] as string[]
  const quizIds = [...new Set(reqs.map((r) => r.standalone_quiz_id).filter(Boolean))] as string[]
  const pathIds = [...new Set(reqs.map((r) => r.path_id).filter(Boolean))] as string[]

  // Path requirements complete when all their videos are complete, so path
  // video ids join the progress lookup.
  const { data: pathItems } = pathIds.length
    ? await supabase
        .from('learning_path_items')
        .select('path_id, video_id')
        .in('path_id', pathIds)
        .returns<{ path_id: string; video_id: string }[]>()
    : { data: [] as { path_id: string; video_id: string }[] }

  const pathVideoIds = (pathItems ?? []).map((i) => i.video_id)
  const allVideoIds = [...new Set([...directVideoIds, ...pathVideoIds])]

  const [videosRes, videoQuizRes, quizzesRes, pathsRes, progressRes, passedAttemptsRes] =
    await Promise.all([
      directVideoIds.length
        ? supabase
            .from('videos')
            .select('id, title, duration, thumbnail_url')
            .in('id', directVideoIds)
            .returns<VideoLite[]>()
        : Promise.resolve({ data: [] as VideoLite[] }),
      directVideoIds.length
        ? supabase
            .from('quizzes')
            .select('id, video_id')
            .in('video_id', directVideoIds)
            .returns<{ id: string; video_id: string }[]>()
        : Promise.resolve({ data: [] as { id: string; video_id: string }[] }),
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
      allVideoIds.length
        ? supabase
            .from('progress')
            .select('video_id, completed, quiz_passed')
            .eq('user_id', userId)
            .in('video_id', allVideoIds)
            .returns<{ video_id: string; completed: boolean; quiz_passed: boolean }[]>()
        : Promise.resolve({ data: [] as { video_id: string; completed: boolean; quiz_passed: boolean }[] }),
      quizIds.length
        ? supabase
            .from('standalone_quiz_attempts')
            .select('quiz_id')
            .eq('user_id', userId)
            .eq('passed', true)
            .in('quiz_id', quizIds)
            .returns<{ quiz_id: string }[]>()
        : Promise.resolve({ data: [] as { quiz_id: string }[] }),
    ])

  const videoById = new Map((videosRes.data ?? []).map((v) => [v.id, v]))
  const videosWithQuiz = new Set((videoQuizRes.data ?? []).map((q) => q.video_id))
  const quizById = new Map((quizzesRes.data ?? []).map((q) => [q.id, q]))
  const pathById = new Map((pathsRes.data ?? []).map((p) => [p.id, p]))
  const progressByVideo = new Map((progressRes.data ?? []).map((p) => [p.video_id, p]))
  const passedQuizIds = new Set((passedAttemptsRes.data ?? []).map((a) => a.quiz_id))
  const awardByProgram = new Map((awards ?? []).map((a) => [a.program_id, a]))

  const pathVideosByPath = new Map<string, string[]>()
  for (const item of pathItems ?? []) {
    const list = pathVideosByPath.get(item.path_id) ?? []
    list.push(item.video_id)
    pathVideosByPath.set(item.path_id, list)
  }

  return programs.map((program) => {
    const programReqs = reqs.filter((r) => r.program_id === program.id)

    let priorAllComplete = true
    const modules: CertModule[] = programReqs.map((r) => {
      let mod: CertModule

      if (r.video_id) {
        const video = videoById.get(r.video_id)
        const prog = progressByVideo.get(r.video_id)
        const hasQuiz = videosWithQuiz.has(r.video_id)
        const completed = Boolean(prog?.completed && (!hasQuiz || prog.quiz_passed))
        mod = {
          requirementId: r.id,
          kind: 'video',
          title: video?.title ?? 'Video (removed)',
          minutes: video?.duration ? Math.max(1, Math.round(video.duration / 60)) : null,
          completed,
          unlocked: priorAllComplete,
          videoId: r.video_id,
          videoThumbnailUrl: video?.thumbnail_url ?? null,
          videoHasQuiz: hasQuiz,
        }
      } else if (r.standalone_quiz_id) {
        const quiz = quizById.get(r.standalone_quiz_id)
        const questionCount = Array.isArray(quiz?.questions) ? quiz.questions.length : 0
        mod = {
          requirementId: r.id,
          kind: 'quiz',
          title: quiz?.title ?? 'Quiz (removed)',
          minutes: null,
          completed: passedQuizIds.has(r.standalone_quiz_id),
          unlocked: priorAllComplete,
          quizId: r.standalone_quiz_id,
          quizQuestionCount: questionCount,
        }
      } else {
        const path = r.path_id ? pathById.get(r.path_id) : undefined
        const vids = r.path_id ? (pathVideosByPath.get(r.path_id) ?? []) : []
        const done = vids.filter((v) => progressByVideo.get(v)?.completed).length
        mod = {
          requirementId: r.id,
          kind: 'path',
          title: path?.name ?? 'Learning path (removed)',
          minutes: null,
          // An empty path can't be "completed" — treat as incomplete so a
          // misconfigured program blocks rather than silently certifies.
          completed: vids.length > 0 && done === vids.length,
          unlocked: priorAllComplete,
          pathId: r.path_id ?? undefined,
          pathVideoCount: vids.length,
          pathCompletedCount: done,
        }
      }

      priorAllComplete = priorAllComplete && mod.completed
      return mod
    })

    const completedCount = modules.filter((m) => m.completed).length
    const award = awardByProgram.get(program.id) ?? null

    let status: CertProgramStatus
    if (award && awardActive(award)) status = 'certified'
    else if (award && award.expires_at && !award.revoked_at) status = 'expired'
    else if (completedCount > 0) status = 'in_progress'
    else status = 'not_started'

    return { program, modules, completedCount, status, award }
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

// THE gate. Pages call this before rendering a module; 4b submit actions
// must call it again before recording anything. Returns the module only if
// it is unlocked for this user right now.
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
  const module = state.modules[index]
  if (!module.unlocked) return null
  return { state, module, index }
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
