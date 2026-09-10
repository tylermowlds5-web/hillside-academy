import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/admin'
import { embedTexts, embeddingProvider } from './embeddings'
import type { PageBlock, PlantData, QuizQuestion } from './types'
import { quizAcceptedAnswers, quizQuestionType } from './types'

// ── Ricky Bobby knowledge indexer ────────────────────────────────────────
// Turns every content row on the site into a knowledge_index row:
// { source_table, source_id, kind, title, url, text, aliases, embedding }.
// One builder per source table produces KnowledgeEntry[]; the same builders
// serve three jobs:
//   • reindex(table, ids)  — after an admin save (lib/knowledge-sync.ts)
//   • prune(table)         — drop index rows whose source is gone
//   • rebuildKnowledgeIndex() — nightly full rebuild (and the admin button)
// Pages flagged needs_review are drafts and are never indexed.
//
// Everything here runs with the service-role client (the index is admin-only
// under RLS and the bank tables hold answer keys) — server-side only.

export const KNOWLEDGE_SOURCE_TABLES = [
  'cert_pages',
  'cert_programs',
  'cert_requirements',
  'cert_questions',
  'videos',
  'quizzes',
  'standalone_quizzes',
  'documents',
  'learning_paths',
] as const
export type KnowledgeSourceTable = (typeof KNOWLEDGE_SOURCE_TABLES)[number]

export type KnowledgeEntry = {
  source_table: KnowledgeSourceTable
  source_id: string
  kind: string
  title: string
  url: string
  text: string
  aliases: string[]
}

// Per-entry text cap. Plant pages run 3–5k chars; this only trims outliers
// and keeps every entry comfortably inside the embedding models' limits.
const MAX_TEXT_CHARS = 12_000

// ── Text helpers ──────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
}

// Rich HTML → readable plain text (block tags become line breaks).
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
      }
      return ENTITIES[code.toLowerCase()] ?? m
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

// Plant/page copy allows **bold** only — drop the markers.
const unbold = (s: string | undefined | null) => (s ?? '').replace(/\*\*/g, '').trim()

function joinLines(lines: (string | null | undefined | false)[]): string {
  return lines
    .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function clip(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text
}

export function textHash(title: string, text: string): string {
  return createHash('sha256').update(title).update('\u0000').update(text).digest('hex')
}

// ── Plant pages ───────────────────────────────────────────────────────────

function factLine(label: string, f: { value?: string; note?: string } | undefined): string | null {
  if (!f) return null
  const value = unbold(f.value)
  const note = unbold(f.note)
  if (!value && !note) return null
  return `${label}: ${value}${note ? ` — ${note}` : ''}`
}

export function plantToText(p: PlantData): string {
  const name = unbold(p.common_name) || 'Plant'
  const head = [
    `Plant: ${name}${p.pronunciation ? ` (pronounced ${unbold(p.pronunciation)})` : ''}`,
    p.botanical_name && `Botanical name: ${unbold(p.botanical_name)}`,
    p.plant_type && `Plant type: ${unbold(p.plant_type)}`,
    factLine('Also called', p.also_called),
    factLine('Mature size', p.mature_size),
    factLine('Tools', p.tools),
    factLine('When we trim', p.when_we_trim),
  ]
  const spot = (p.spot_it ?? []).map(unbold).filter(Boolean)
  const steps = (p.steps ?? []).map((s, i) => {
    const why = unbold(s.why)
    const whyLabel = unbold(s.why_label) || 'Why'
    return `${i + 1}. ${unbold(s.title)}: ${unbold(s.body)}${why ? ` (${whyLabel}: ${why})` : ''}`
  })
  const tips = (p.tip_sections ?? []).flatMap((sec) => [
    `${unbold(sec.heading)}${sec.sub ? ` — ${unbold(sec.sub)}` : ''}`,
    ...sec.cards.map((c) => `- ${unbold(c.title)}: ${unbold(c.body)}`),
  ])
  const mistakes = (p.mistakes ?? []).map(unbold).filter(Boolean)
  const captions = (p.photos ?? []).map((ph) => unbold(ph.caption)).filter(Boolean)

  return joinLines([
    ...head,
    spot.length > 0 && `How to spot it:\n${spot.map((s) => `- ${s}`).join('\n')}`,
    p.trim_summary && `How we trim it: ${unbold(p.trim_summary)}`,
    p.know_this_first && `Know this first: ${unbold(p.know_this_first)}`,
    steps.length > 0 && `Steps:\n${steps.join('\n')}`,
    tips.length > 0 && tips.join('\n'),
    mistakes.length > 0 && `Common mistakes:\n${mistakes.map((m) => `- ${m}`).join('\n')}`,
    captions.length > 0 && `Photo notes: ${captions.join('; ')}`,
  ])
}

// Names Ricky matches a question against: common name, botanical name, and
// each "also called" name (comma / slash / "or" separated).
export function plantAliases(p: PlantData): string[] {
  const out = new Set<string>()
  const add = (s: string | undefined) => {
    const v = unbold(s)
    if (v.length >= 3) out.add(v)
  }
  add(p.common_name)
  add(p.botanical_name)
  for (const part of unbold(p.also_called?.value).split(/\s*(?:,|;|\/|\bor\b)\s*/i)) add(part)
  return [...out]
}

// ── Text pages (blocks or legacy body) ────────────────────────────────────

export function blocksToText(blocks: PageBlock[]): string {
  return joinLines(
    blocks.map((b) => {
      switch (b.type) {
        case 'heading':
          return `${unbold(b.text)}${b.sub ? ` — ${unbold(b.sub)}` : ''}`
        case 'richtext':
          return htmlToText(b.html)
        case 'card':
          return b.title ? `${unbold(b.title)}: ${unbold(b.body)}` : unbold(b.body)
        case 'callout':
          return b.label ? `${unbold(b.label)}: ${unbold(b.body)}` : unbold(b.body)
        case 'bullets':
          return b.items.map((i) => `- ${unbold(i)}`).join('\n')
        case 'photos': {
          const caps = b.photos.map((p) => unbold(p.caption)).filter(Boolean)
          return caps.length ? `Photos: ${caps.join('; ')}` : ''
        }
        default:
          return ''
      }
    })
  )
}

// ── Quiz questions ────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True or false',
  multiple_select: 'Select all that apply',
  short_answer: 'Short answer',
  sequence: 'Order the steps',
}

export function correctAnswerText(q: QuizQuestion): string {
  const type = quizQuestionType(q)
  if (type === 'sequence') {
    return (q.sequence_items ?? []).map((s, i) => `${i + 1}. ${s}`).join(' ')
  }
  if (type === 'short_answer') return quizAcceptedAnswers(q).join(' / ')
  return (q.options ?? [])
    .filter((o) => o.is_correct)
    .map((o) => o.option_text)
    .join(', ')
}

export function questionToText(q: QuizQuestion, context?: string): string {
  const type = quizQuestionType(q)
  const options = (q.options ?? []).map((o) => o.option_text).filter(Boolean)
  return joinLines([
    context && `Context: ${context}`,
    `Question (${TYPE_LABEL[type] ?? type}): ${q.question_text}`,
    options.length > 0 && type !== 'sequence' && `Options: ${options.join('; ')}`,
    `Correct answer: ${correctAnswerText(q) || '(not set)'}`,
    q.explanation && `Explanation: ${q.explanation}`,
  ])
}

// ── Context lookups shared by the cert builders ───────────────────────────

type ProgramLite = { id: string; name: string; description: string | null; is_active: boolean }
type ModuleLite = {
  id: string
  program_id: string | null
  video_id: string | null
  standalone_quiz_id: string | null
  path_id: string | null
  lesson_title: string | null
  lesson_body: string | null
}

type CertContext = {
  programById: Map<string, ProgramLite>
  moduleById: Map<string, ModuleLite>
  // module id → the program its URL should open in (home program if it is
  // still linked there, else the first program that contains it).
  programForModule: Map<string, string>
  videoTitleById: Map<string, string>
  quizTitleById: Map<string, string>
  pathNameById: Map<string, string>
  categoryNameById: Map<string, string>
}

async function loadCertContext(db: SupabaseClient): Promise<CertContext> {
  const [programsRes, modulesRes, linksRes, videosRes, quizzesRes, pathsRes, catsRes] = await Promise.all([
    db.from('cert_programs').select('id, name, description, is_active').returns<ProgramLite[]>(),
    db
      .from('cert_requirements')
      .select('id, program_id, video_id, standalone_quiz_id, path_id, lesson_title, lesson_body')
      .returns<ModuleLite[]>(),
    db
      .from('cert_program_modules')
      .select('program_id, module_id, position')
      .order('position')
      .returns<{ program_id: string; module_id: string; position: number }[]>(),
    db.from('videos').select('id, title').returns<{ id: string; title: string }[]>(),
    db.from('standalone_quizzes').select('id, title').returns<{ id: string; title: string }[]>(),
    db.from('learning_paths').select('id, name').returns<{ id: string; name: string }[]>(),
    db.from('cert_categories').select('id, name').returns<{ id: string; name: string }[]>(),
  ])

  const programById = new Map((programsRes.data ?? []).map((p) => [p.id, p]))
  const moduleById = new Map((modulesRes.data ?? []).map((m) => [m.id, m]))
  const linkedPrograms = new Map<string, string[]>()
  for (const l of linksRes.data ?? []) {
    const list = linkedPrograms.get(l.module_id) ?? []
    list.push(l.program_id)
    linkedPrograms.set(l.module_id, list)
  }
  const programForModule = new Map<string, string>()
  for (const m of moduleById.values()) {
    const linked = linkedPrograms.get(m.id) ?? []
    const home = m.program_id && linked.includes(m.program_id) ? m.program_id : linked[0]
    if (home) programForModule.set(m.id, home)
  }

  return {
    programById,
    moduleById,
    programForModule,
    videoTitleById: new Map((videosRes.data ?? []).map((v) => [v.id, v.title])),
    quizTitleById: new Map((quizzesRes.data ?? []).map((q) => [q.id, q.title])),
    pathNameById: new Map((pathsRes.data ?? []).map((p) => [p.id, p.name])),
    categoryNameById: new Map((catsRes.data ?? []).map((c) => [c.id, c.name])),
  }
}

function moduleTitle(m: ModuleLite, ctx: CertContext): string {
  if (m.lesson_title) return m.lesson_title
  if (m.video_id) return ctx.videoTitleById.get(m.video_id) ?? 'Video module'
  if (m.standalone_quiz_id) return ctx.quizTitleById.get(m.standalone_quiz_id) ?? 'Quiz module'
  if (m.path_id) return ctx.pathNameById.get(m.path_id) ?? 'Learning path module'
  return 'Module'
}

function moduleUrl(moduleId: string, ctx: CertContext): string {
  const programId = ctx.programForModule.get(moduleId)
  return programId ? `/certs/${programId}/modules/${moduleId}` : '/certs'
}

// ── Builders ──────────────────────────────────────────────────────────────
// Each returns the entries for `ids` (or every row when ids is undefined).
// Rows that should NOT be indexed (drafts, empty content) simply produce no
// entry — reindex/prune then remove any stale index row for them.

type PageRow = {
  id: string
  requirement_id: string
  kind: 'video' | 'text' | 'plant'
  title: string | null
  body: string | null
  category_id: string | null
  plant_data: PlantData | null
  blocks: PageBlock[] | null
  needs_review: boolean
}

async function buildCertPages(db: SupabaseClient, ctx: CertContext, ids?: string[]): Promise<KnowledgeEntry[]> {
  let q = db.from('cert_pages').select('id, requirement_id, kind, title, body, category_id, plant_data, blocks, needs_review')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q.returns<PageRow[]>()
  if (error) throw new Error(`cert_pages: ${error.message}`)

  const entries: KnowledgeEntry[] = []
  for (const p of data ?? []) {
    if (p.needs_review) continue // drafts are invisible to employees
    if (p.kind === 'video') continue // the video itself is indexed from the library
    const mod = ctx.moduleById.get(p.requirement_id)
    const modTitle = mod ? moduleTitle(mod, ctx) : null
    const section = p.category_id ? ctx.categoryNameById.get(p.category_id) : null
    // Citations open the standalone reference copy (/library), never the
    // gated cert stepper — see app/(library).
    const url = p.kind === 'plant' ? `/library/plant/${p.id}` : `/library/page/${p.id}`
    const where = joinLines([modTitle && `Lesson: ${modTitle}`, section && `Section: ${section}`])

    if (p.kind === 'plant') {
      if (!p.plant_data) continue
      const title = unbold(p.plant_data.common_name) || p.title || 'Plant'
      entries.push({
        source_table: 'cert_pages',
        source_id: p.id,
        kind: 'Plant ID',
        title,
        url,
        text: clip(joinLines([plantToText(p.plant_data), where])),
        aliases: plantAliases(p.plant_data),
      })
      continue
    }

    const body = p.blocks && p.blocks.length > 0 ? blocksToText(p.blocks) : htmlToText(p.body)
    if (!body && !p.title) continue
    entries.push({
      source_table: 'cert_pages',
      source_id: p.id,
      kind: 'Lesson page',
      title: p.title || modTitle || 'Lesson page',
      url,
      text: clip(joinLines([p.title && `Page: ${p.title}`, where, body])),
      aliases: [],
    })
  }
  return entries
}

async function buildCertPrograms(ctx: CertContext, ids?: string[]): Promise<KnowledgeEntry[]> {
  const entries: KnowledgeEntry[] = []
  for (const p of ctx.programById.values()) {
    if (ids && !ids.includes(p.id)) continue
    // Module list gives the program entry something to match on.
    const moduleNames = [...ctx.moduleById.values()]
      .filter((m) => ctx.programForModule.get(m.id) === p.id)
      .map((m) => moduleTitle(m, ctx))
    entries.push({
      source_table: 'cert_programs',
      source_id: p.id,
      kind: 'Certification',
      title: p.name,
      url: `/certs/${p.id}`,
      text: clip(
        joinLines([
          `Certification program: ${p.name}${p.is_active ? '' : ' (inactive)'}`,
          p.description && unbold(p.description),
          moduleNames.length > 0 && `Modules: ${moduleNames.join('; ')}`,
        ])
      ),
      aliases: [],
    })
  }
  return entries
}

async function buildCertModules(ctx: CertContext, ids?: string[]): Promise<KnowledgeEntry[]> {
  const entries: KnowledgeEntry[] = []
  for (const m of ctx.moduleById.values()) {
    if (ids && !ids.includes(m.id)) continue
    const programId = ctx.programForModule.get(m.id)
    if (!programId) continue // orphan module — not reachable anywhere
    const program = ctx.programById.get(programId)
    const title = moduleTitle(m, ctx)
    entries.push({
      source_table: 'cert_requirements',
      source_id: m.id,
      kind: 'Cert module',
      title,
      url: moduleUrl(m.id, ctx),
      text: clip(
        joinLines([
          `Module: ${title}`,
          program && `Part of certification: ${program.name}`,
          m.lesson_body && htmlToText(m.lesson_body),
        ])
      ),
      aliases: [],
    })
  }
  return entries
}

type BankQuestionRow = {
  id: string
  group_id: string | null
  requirement_id: string | null
  question: QuizQuestion
  cert_question_groups: { requirement_id: string; label: string | null } | null
}

async function buildCertQuestions(db: SupabaseClient, ctx: CertContext, ids?: string[]): Promise<KnowledgeEntry[]> {
  let q = db.from('cert_questions').select('id, group_id, requirement_id, question, cert_question_groups ( requirement_id, label )')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q.returns<BankQuestionRow[]>()
  if (error) throw new Error(`cert_questions: ${error.message}`)

  const entries: KnowledgeEntry[] = []
  for (const q of data ?? []) {
    const moduleId = q.requirement_id ?? q.cert_question_groups?.requirement_id
    if (!moduleId || !q.question?.question_text) continue
    const mod = ctx.moduleById.get(moduleId)
    const modTitle = mod ? moduleTitle(mod, ctx) : 'Cert module'
    // A photo group's label usually names the plant in the photo — that's
    // the context the question is really about.
    const label = q.cert_question_groups?.label?.trim() || null
    entries.push({
      source_table: 'cert_questions',
      source_id: q.id,
      kind: 'Cert quiz question',
      title: `${modTitle} quiz${label ? `: ${label}` : ''}`,
      url: moduleUrl(moduleId, ctx),
      text: clip(questionToText(q.question, joinLines([`${modTitle} module quiz`, label && `Photo: ${label}`]).replace(/\n/g, ' — '))),
      aliases: [],
    })
  }
  return entries
}

type VideoRow = { id: string; title: string; description: string | null; category: string | null; sub_category: string | null }

async function buildVideos(db: SupabaseClient, ids?: string[]): Promise<KnowledgeEntry[]> {
  let q = db.from('videos').select('id, title, description, category, sub_category')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q.returns<VideoRow[]>()
  if (error) throw new Error(`videos: ${error.message}`)
  return (data ?? []).map((v) => ({
    source_table: 'videos',
    source_id: v.id,
    kind: 'Video',
    title: v.title,
    url: `/library/video/${v.id}`,
    text: clip(
      joinLines([
        `Training video: ${v.title}`,
        (v.category || v.sub_category) && `Category: ${[v.category, v.sub_category].filter(Boolean).join(' › ')}`,
        v.description && unbold(htmlToText(v.description)),
      ])
    ),
    aliases: [],
  }))
}

type VideoQuizRow = { id: string; video_id: string | null; questions: QuizQuestion[]; videos: { title: string } | null }

async function buildVideoQuizzes(db: SupabaseClient, ids?: string[]): Promise<KnowledgeEntry[]> {
  let q = db.from('quizzes').select('id, video_id, questions, videos ( title )')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q.returns<VideoQuizRow[]>()
  if (error) throw new Error(`quizzes: ${error.message}`)
  const entries: KnowledgeEntry[] = []
  for (const quiz of data ?? []) {
    const videoTitle = quiz.videos?.title ?? 'Video'
    const questions = Array.isArray(quiz.questions) ? quiz.questions : []
    questions.forEach((q, i) => {
      if (!q?.question_text) return
      entries.push({
        source_table: 'quizzes',
        source_id: `${quiz.id}:${i}`,
        kind: 'Video quiz',
        title: `${videoTitle} quiz`,
        url: quiz.video_id ? `/library/video/${quiz.video_id}` : '/videos',
        text: clip(questionToText(q, `Quiz for the video "${videoTitle}"`)),
        aliases: [],
      })
    })
  }
  return entries
}

type StandaloneQuizRow = { id: string; title: string; description: string | null; questions: QuizQuestion[] }

async function buildStandaloneQuizzes(db: SupabaseClient, ids?: string[]): Promise<KnowledgeEntry[]> {
  let q = db.from('standalone_quizzes').select('id, title, description, questions')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q.returns<StandaloneQuizRow[]>()
  if (error) throw new Error(`standalone_quizzes: ${error.message}`)
  const entries: KnowledgeEntry[] = []
  for (const quiz of data ?? []) {
    const url = `/quizzes/${quiz.id}`
    const questions = Array.isArray(quiz.questions) ? quiz.questions : []
    entries.push({
      source_table: 'standalone_quizzes',
      source_id: quiz.id,
      kind: 'Quiz',
      title: quiz.title,
      url,
      text: clip(
        joinLines([
          `Quiz: ${quiz.title}`,
          quiz.description && htmlToText(quiz.description),
          questions.length > 0 && `${questions.length} question${questions.length === 1 ? '' : 's'}.`,
        ])
      ),
      aliases: [],
    })
    questions.forEach((q, i) => {
      if (!q?.question_text) return
      entries.push({
        source_table: 'standalone_quizzes',
        source_id: `${quiz.id}:${i}`,
        kind: 'Quiz',
        title: quiz.title,
        url,
        text: clip(questionToText(q, `Quiz "${quiz.title}"`)),
        aliases: [],
      })
    })
  }
  return entries
}

type DocumentRow = { id: string; title: string; description: string | null; file_type: string | null }

async function buildDocuments(db: SupabaseClient, ids?: string[]): Promise<KnowledgeEntry[]> {
  let q = db.from('documents').select('id, title, description, file_type')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q.returns<DocumentRow[]>()
  if (error) throw new Error(`documents: ${error.message}`)
  return (data ?? []).map((d) => ({
    source_table: 'documents',
    source_id: d.id,
    kind: 'Document',
    title: d.title,
    url: '/documents',
    text: clip(joinLines([`Document: ${d.title}${d.file_type ? ` (${d.file_type})` : ''}`, d.description && htmlToText(d.description)])),
    aliases: [],
  }))
}

type PathRow = { id: string; name: string; description: string | null; learning_path_items: { videos: { title: string } | null }[] }

async function buildLearningPaths(db: SupabaseClient, ids?: string[]): Promise<KnowledgeEntry[]> {
  let q = db.from('learning_paths').select('id, name, description, learning_path_items ( videos ( title ) )')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q.returns<PathRow[]>()
  if (error) throw new Error(`learning_paths: ${error.message}`)
  return (data ?? []).map((p) => {
    const videos = (p.learning_path_items ?? []).map((i) => i.videos?.title).filter((t): t is string => !!t)
    return {
      source_table: 'learning_paths',
      source_id: p.id,
      kind: 'Learning path',
      title: p.name,
      url: `/paths/${p.id}`,
      text: clip(
        joinLines([
          `Learning path: ${p.name}`,
          p.description && htmlToText(p.description),
          videos.length > 0 && `Videos: ${videos.join('; ')}`,
        ])
      ),
      aliases: [],
    }
  })
}

// Builds entries for one table (all rows, or just `ids`).
export async function buildEntries(
  table: KnowledgeSourceTable,
  ids?: string[],
  db: SupabaseClient = createAdminClient()
): Promise<KnowledgeEntry[]> {
  switch (table) {
    case 'cert_pages':
      return buildCertPages(db, await loadCertContext(db), ids)
    case 'cert_programs':
      return buildCertPrograms(await loadCertContext(db), ids)
    case 'cert_requirements':
      return buildCertModules(await loadCertContext(db), ids)
    case 'cert_questions':
      return buildCertQuestions(db, await loadCertContext(db), ids)
    case 'videos':
      return buildVideos(db, ids)
    case 'quizzes':
      return buildVideoQuizzes(db, ids)
    case 'standalone_quizzes':
      return buildStandaloneQuizzes(db, ids)
    case 'documents':
      return buildDocuments(db, ids)
    case 'learning_paths':
      return buildLearningPaths(db, ids)
  }
}

// ── Writing the index ─────────────────────────────────────────────────────

type ExistingRow = { source_table: string; source_id: string; text_hash: string | null; has_embedding: boolean }

async function loadExisting(db: SupabaseClient, table?: KnowledgeSourceTable): Promise<Map<string, ExistingRow>> {
  let q = db.from('knowledge_index').select('source_table, source_id, text_hash, embedding')
  if (table) q = q.eq('source_table', table)
  const { data, error } = await q.returns<{ source_table: string; source_id: string; text_hash: string | null; embedding: unknown }[]>()
  if (error) throw new Error(`knowledge_index read: ${error.message}`)
  return new Map(
    (data ?? []).map((r) => [
      `${r.source_table}\u0000${r.source_id}`,
      { source_table: r.source_table, source_id: r.source_id, text_hash: r.text_hash, has_embedding: r.embedding != null },
    ])
  )
}

const key = (e: { source_table: string; source_id: string }) => `${e.source_table}\u0000${e.source_id}`

// Upserts entries. Only entries whose text changed (or that have no vector
// yet) are sent to the embedding provider; unchanged rows just refresh their
// metadata. Returns how many vectors were computed.
async function upsertEntries(
  db: SupabaseClient,
  entries: KnowledgeEntry[],
  existing: Map<string, ExistingRow>
): Promise<{ embedded: number; embeddingError: string | null }> {
  if (entries.length === 0) return { embedded: 0, embeddingError: null }
  const provider = embeddingProvider()
  const hashes = entries.map((e) => textHash(e.title, e.text))

  const needsVector = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => {
      const prev = existing.get(key(e))
      return !prev || !prev.has_embedding || prev.text_hash !== hashes[i]
    })

  let vectors = new Map<number, number[]>()
  let embeddingError: string | null = null
  if (provider && needsVector.length > 0) {
    try {
      const vecs = await embedTexts(
        needsVector.map(({ e }) => `${e.title}\n${e.text}`),
        'document'
      )
      vectors = new Map(needsVector.map(({ i }, n) => [i, vecs[n]]))
    } catch (err) {
      // Never let an embedding outage block the index: rows are written
      // without vectors (full-text search still finds them) and the next
      // rebuild retries them (has_embedding=false).
      embeddingError = err instanceof Error ? err.message : String(err)
      console.error('[knowledge-index] embedding failed:', embeddingError)
    }
  }

  const now = new Date().toISOString()
  const rows = entries.map((e, i) => {
    const vec = vectors.get(i)
    const prev = existing.get(key(e))
    const keepVector = !vec && prev?.has_embedding && prev.text_hash === hashes[i]
    return {
      source_table: e.source_table,
      source_id: e.source_id,
      kind: e.kind,
      title: e.title,
      url: e.url,
      text: e.text,
      aliases: e.aliases,
      text_hash: hashes[i],
      updated_at: now,
      // Omit the column entirely to keep a still-valid stored vector;
      // otherwise write the new vector or clear a stale one.
      ...(keepVector ? {} : { embedding: vec ?? null }),
    }
  })

  // PostgREST bulk writes need every object in a request to carry the same
  // keys (a missing key would be written as NULL), so rows that keep their
  // stored vector (no `embedding` key) go in a separate request from rows
  // that set one. Vectors make rows large — write in modest batches.
  const groups = [rows.filter((r) => 'embedding' in r), rows.filter((r) => !('embedding' in r))]
  for (const group of groups) {
    for (let start = 0; start < group.length; start += 40) {
      const { error } = await db
        .from('knowledge_index')
        .upsert(group.slice(start, start + 40), { onConflict: 'source_table,source_id' })
      if (error) throw new Error(`knowledge_index upsert: ${error.message}`)
    }
  }
  return { embedded: vectors.size, embeddingError }
}

async function deleteKeys(db: SupabaseClient, table: KnowledgeSourceTable, sourceIds: string[]) {
  for (let start = 0; start < sourceIds.length; start += 200) {
    const { error } = await db
      .from('knowledge_index')
      .delete()
      .eq('source_table', table)
      .in('source_id', sourceIds.slice(start, start + 200))
    if (error) throw new Error(`knowledge_index delete: ${error.message}`)
  }
}

// Re-indexes specific source rows after a save. A row that no longer yields
// an entry (deleted, now a draft, emptied) has its index row removed. For
// composite ids (quiz questions) pass the quiz id — every question of that
// quiz is refreshed and stale indexes dropped.
export async function reindex(table: KnowledgeSourceTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = createAdminClient()
  const entries = await buildEntries(table, ids, db)
  const existing = await loadExisting(db, table)
  await upsertEntries(db, entries, existing)

  const fresh = new Set(entries.map((e) => e.source_id))
  const stale = [...existing.values()]
    .filter((r) => ids.some((id) => r.source_id === id || r.source_id.startsWith(`${id}:`)))
    .map((r) => r.source_id)
    .filter((sid) => !fresh.has(sid))
  if (stale.length > 0) await deleteKeys(db, table, stale)
}

// Everything that hangs off one cert module: the module row, its pages, and
// its question bank. Used after bank/page edits that add, remove, or relabel
// many rows at once; the prunes drop whatever was replaced.
export async function reindexModuleContent(requirementId: string): Promise<void> {
  const db = createAdminClient()
  const [{ data: pages }, { data: groups }, { data: standalone }] = await Promise.all([
    db.from('cert_pages').select('id').eq('requirement_id', requirementId).returns<{ id: string }[]>(),
    db
      .from('cert_question_groups')
      .select('cert_questions ( id )')
      .eq('requirement_id', requirementId)
      .returns<{ cert_questions: { id: string }[] }[]>(),
    db.from('cert_questions').select('id').eq('requirement_id', requirementId).returns<{ id: string }[]>(),
  ])
  const questionIds = [
    ...(groups ?? []).flatMap((g) => g.cert_questions.map((q) => q.id)),
    ...(standalone ?? []).map((q) => q.id),
  ]
  await reindex('cert_requirements', [requirementId])
  await reindex('cert_pages', (pages ?? []).map((p) => p.id))
  await reindex('cert_questions', questionIds)
  await prune('cert_pages')
  await prune('cert_questions')
}

// Drops index rows for `table` whose source row is gone (or no longer
// indexable). Used after deletes and by the nightly rebuild.
export async function prune(table: KnowledgeSourceTable): Promise<number> {
  const db = createAdminClient()
  const [entries, existing] = await Promise.all([buildEntries(table, undefined, db), loadExisting(db, table)])
  const valid = new Set(entries.map((e) => e.source_id))
  const stale = [...existing.values()].map((r) => r.source_id).filter((sid) => !valid.has(sid))
  if (stale.length > 0) await deleteKeys(db, table, stale)
  return stale.length
}

export type RebuildSummary = {
  total: number
  byTable: Record<string, number>
  embedded: number
  removed: number
  provider: string | null
  embeddingError: string | null
  durationMs: number
}

// Full rebuild: every table, every row; unchanged rows keep their vectors,
// deleted rows leave the index. Safe to run any time (the admin button and
// the nightly cron both call this).
export async function rebuildKnowledgeIndex(): Promise<RebuildSummary> {
  const started = Date.now()
  const db = createAdminClient()
  const existing = await loadExisting(db)

  const all: KnowledgeEntry[] = []
  const byTable: Record<string, number> = {}
  for (const table of KNOWLEDGE_SOURCE_TABLES) {
    const entries = await buildEntries(table, undefined, db)
    byTable[table] = entries.length
    all.push(...entries)
  }

  const { embedded, embeddingError } = await upsertEntries(db, all, existing)

  const valid = new Set(all.map(key))
  let removed = 0
  for (const table of KNOWLEDGE_SOURCE_TABLES) {
    const stale = [...existing.values()]
      .filter((r) => r.source_table === table && !valid.has(key(r)))
      .map((r) => r.source_id)
    if (stale.length > 0) {
      await deleteKeys(db, table, stale)
      removed += stale.length
    }
  }
  // Rows from a source table this code no longer knows about.
  const unknown = [...existing.values()].filter(
    (r) => !(KNOWLEDGE_SOURCE_TABLES as readonly string[]).includes(r.source_table)
  )
  for (const r of unknown) {
    await db.from('knowledge_index').delete().eq('source_table', r.source_table).eq('source_id', r.source_id)
    removed++
  }

  const provider = embeddingProvider()
  return {
    total: all.length,
    byTable,
    embedded,
    removed,
    provider: provider ? `${provider.name}/${provider.model}` : null,
    embeddingError,
    durationMs: Date.now() - started,
  }
}
