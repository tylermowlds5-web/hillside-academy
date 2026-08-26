import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CertTopBar from '../../../../CertTopBar'
import CertModuleContent from './CertModuleContent'
import { loadProgramState, requireUnlockedModule, topBarProgress } from '@/lib/certs'
import type { CertPage, Video } from '@/lib/types'
import type { LearnerPage } from './CertModuleContent'

// Module page. The gate lives in requireUnlockedModule (lib/certs.ts):
// a module renders ONLY if every prior requirement is genuinely complete for
// this user, re-derived from the database on every request — typing the URL
// of a locked module redirects to the program overview. The cert server
// actions (lesson progress, quiz start/submit) re-run the same gate.
export default async function ModulePage(props: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await props.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const gate = await requireUnlockedModule(supabase, user.id, programId, moduleId)
  if (!gate) {
    // Either the program/module doesn't exist, or it's locked for this user.
    // Distinguish so bad links 404 while locked modules bounce to the overview.
    const state = await loadProgramState(supabase, user.id, programId)
    if (!state || !state.modules.some((m) => m.requirementId === moduleId)) notFound()
    redirect(`/certs/${programId}`)
  }

  const { state, module: mod, index } = gate
  const prev = index > 0 ? state.modules[index - 1] : null
  const next = index < state.modules.length - 1 ? state.modules[index + 1] : null

  // Video modules need the full video row for the player.
  let video: Video | null = null
  if (mod.kind === 'video' && mod.videoId) {
    const { data } = await supabase
      .from('videos')
      .select('*')
      .eq('id', mod.videoId)
      .single<Video>()
    video = data
  }

  // Paged lesson modules need the full page content + this user's page
  // progress (per-page state; completion itself is server-derived in the
  // loader and re-checked by the page actions).
  let learnerPages: LearnerPage[] | null = null
  if (mod.kind === 'lesson' && (mod.pages?.length ?? 0) > 0) {
    const { data: pageRows } = await supabase
      .from('cert_pages')
      .select('*')
      .eq('requirement_id', mod.requirementId)
      .order('sort_order')
      .returns<CertPage[]>()

    const videoIds = (pageRows ?? []).map((p) => p.video_id).filter(Boolean) as string[]
    const [videosRes, progressRes, categoriesRes] = await Promise.all([
      videoIds.length
        ? supabase.from('videos').select('*').in('id', videoIds).returns<Video[]>()
        : Promise.resolve({ data: [] as Video[] }),
      (pageRows ?? []).length
        ? supabase
            .from('cert_page_progress')
            .select('page_id, percent_watched, actual_seconds_watched, completed')
            .eq('user_id', user.id)
            .in('page_id', (pageRows ?? []).map((p) => p.id))
            .returns<{ page_id: string; percent_watched: number; actual_seconds_watched: number; completed: boolean }[]>()
        : Promise.resolve({ data: [] as { page_id: string; percent_watched: number; actual_seconds_watched: number; completed: boolean }[] }),
      // Category names label the lesson sections (display only — page order
      // and gating still follow sort_order alone).
      supabase
        .from('cert_categories')
        .select('id, name')
        .eq('requirement_id', mod.requirementId)
        .returns<{ id: string; name: string }[]>(),
    ])
    const videoById = new Map((videosRes.data ?? []).map((v) => [v.id, v]))
    const progressByPage = new Map((progressRes.data ?? []).map((p) => [p.page_id, p]))
    const categoryName = new Map((categoriesRes.data ?? []).map((c) => [c.id, c.name]))

    learnerPages = (pageRows ?? []).map((p) => {
      const prog = progressByPage.get(p.id)
      return {
        id: p.id,
        kind: p.kind,
        title: p.title,
        body: p.body,
        imageUrl: p.image_url,
        imagePosition: p.image_position,
        categoryLabel: p.category_id ? (categoryName.get(p.category_id) ?? null) : null,
        plantData: p.plant_data,
        blocks: p.blocks,
        video: p.video_id ? (videoById.get(p.video_id) ?? null) : null,
        completed: prog?.completed ?? false,
        percent_watched: prog?.percent_watched ?? 0,
        actual_seconds_watched: prog?.actual_seconds_watched ?? 0,
      }
    })
  }

  return (
    <>
      <CertTopBar
        title={state.program.name}
        subtitle={`Module ${index + 1} of ${state.modules.length} — ${mod.title}`}
        progress={topBarProgress(state, index)}
        backHref={`/certs/${programId}`}
      />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Module {index + 1}
          </p>
          {mod.completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Completed
            </span>
          )}
        </div>
        <h1 className="mb-6 mt-2 font-serif text-2xl font-semibold text-plum sm:text-3xl">
          {mod.title}
        </h1>

        {mod.kind === 'video' && !video && (
          <p className="rounded-xl border border-plum/10 bg-white p-6 text-sm text-plum/60">
            This module&apos;s video is no longer available. Let an admin know.
          </p>
        )}

        {((mod.kind === 'video' && video) || mod.kind === 'lesson') && (
          <CertModuleContent
            programId={programId}
            requirementId={mod.requirementId}
            kind={mod.kind === 'video' ? 'video' : 'lesson'}
            video={video}
            lessonBody={mod.lessonBody}
            lessonImageUrl={mod.lessonImageUrl}
            pages={learnerPages}
            initialLesson={{
              percent_watched: mod.lessonPercent,
              actual_seconds_watched: mod.lessonSeconds,
              completed: mod.lessonCompleted,
            }}
            quiz={{
              hasBank: mod.hasQuizBank,
              passed: mod.quizPassed,
              passScore: mod.quizPassScore,
              attemptCount: mod.quizAttemptCount,
              bestScore: mod.quizBestScore,
            }}
          />
        )}

        {mod.kind === 'quiz' && (
          <div className="rounded-2xl border border-plum/10 bg-white p-8 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <h2 className="mt-4 font-serif text-xl font-semibold text-plum">{mod.title}</h2>
            <p className="mt-2 text-sm text-plum/60">
              {mod.quizQuestionCount ? `${mod.quizQuestionCount} questions. ` : ''}
              This module is completed by passing the quiz in everyday HU.
            </p>
            {mod.quizId && (
              <Link
                href={`/quizzes/${mod.quizId}`}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Open quiz
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        )}

        {mod.kind === 'path' && (
          <div className="rounded-2xl border border-plum/10 bg-white p-8 shadow-sm">
            <h2 className="font-serif text-xl font-semibold text-plum">{mod.title}</h2>
            <p className="mt-2 text-sm text-plum/60">
              This module is completed by finishing the learning path in everyday HU
              {typeof mod.pathVideoCount === 'number' && (
                <>
                  {' '}
                  — {mod.pathCompletedCount} of {mod.pathVideoCount} videos done
                </>
              )}
              .
            </p>
            {mod.pathId && (
              <Link
                href={`/paths/${mod.pathId}`}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Open learning path
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-4">
          {prev ? (
            <Link
              href={`/certs/${programId}/modules/${prev.requirementId}`}
              className="inline-flex items-center gap-2 rounded-full border border-plum/15 px-5 py-2.5 text-sm font-semibold text-plum/70 transition-colors hover:border-plum/30 hover:text-plum"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </Link>
          ) : (
            <span />
          )}

          {next &&
            (next.unlocked ? (
              <Link
                href={`/certs/${programId}/modules/${next.requirementId}`}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Next module
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <span
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-plum/10 px-6 py-2.5 text-sm font-semibold text-plum/40"
                title="Locked until this module is complete"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Next locked
              </span>
            ))}
        </div>

        {next && !next.unlocked && (
          <p className="mt-4 text-right text-xs text-plum/40">
            Next: {next.title} — unlocks when this module is complete.
          </p>
        )}
      </main>
    </>
  )
}
