'use client'

import { useState } from 'react'
import type { PlantData, PlantFactField } from '@/lib/types'
import PlantPage from '@/components/cert/PlantPage'
import { updateCertPlantPage } from '@/app/cert-admin-actions'

// ── Plant page form ───────────────────────────────────────────────────────
// Structured editor for a kind='plant' cert page, saved wholesale to
// cert_pages.plant_data. Every repeatable (spot-it lines, steps, tip
// sections, tip cards, mistakes) supports add / remove / reorder.
// "Paste plant copy" imports the PlantData JSON shape into the form
// WITHOUT saving, validating field-by-field and listing everything that
// failed instead of silently dropping it. "Export JSON" copies the current
// form as that same shape. The live preview renders the real PlantPage
// component on a tan swatch.

// Draft mirrors PlantData with every field present (empty-string defaults)
// so inputs are always controlled.
type FactDraft = { value: string; note: string }
type StepDraft = { title: string; body: string; why_label: string; why: string }
type CardDraft = { title: string; body: string }
type TipSectionDraft = { heading: string; sub: string; cards: CardDraft[] }

type Draft = {
  common_name: string
  pronunciation: string
  botanical_name: string
  plant_type: string
  photo_url: string
  spot_it: string[]
  also_called: FactDraft
  mature_size: FactDraft
  tools: FactDraft
  when_we_trim: FactDraft
  trim_summary: string
  know_this_first: string
  steps: StepDraft[]
  tip_sections: TipSectionDraft[]
  mistakes: string[]
}

const FACT_KEYS = ['also_called', 'mature_size', 'tools', 'when_we_trim'] as const
const FACT_LABEL: Record<(typeof FACT_KEYS)[number], string> = {
  also_called: 'Also called',
  mature_size: 'Mature size',
  tools: 'Tools',
  when_we_trim: 'When we trim it',
}

const emptyFact = (): FactDraft => ({ value: '', note: '' })

function normalizeFact(f: PlantFactField | undefined): FactDraft {
  return { value: f?.value ?? '', note: f?.note ?? '' }
}

function normalize(data: PlantData | null): Draft {
  return {
    common_name: data?.common_name ?? '',
    pronunciation: data?.pronunciation ?? '',
    botanical_name: data?.botanical_name ?? '',
    plant_type: data?.plant_type ?? '',
    photo_url: data?.photo_url ?? '',
    spot_it: data?.spot_it ?? [],
    also_called: normalizeFact(data?.also_called),
    mature_size: normalizeFact(data?.mature_size),
    tools: normalizeFact(data?.tools),
    when_we_trim: normalizeFact(data?.when_we_trim),
    trim_summary: data?.trim_summary ?? '',
    know_this_first: data?.know_this_first ?? '',
    steps: (data?.steps ?? []).map((s) => ({
      title: s.title ?? '',
      body: s.body ?? '',
      why_label: s.why_label ?? '',
      why: s.why ?? '',
    })),
    tip_sections: (data?.tip_sections ?? []).map((s) => ({
      heading: s.heading ?? '',
      sub: s.sub ?? '',
      cards: (s.cards ?? []).map((c) => ({ title: c.title ?? '', body: c.body ?? '' })),
    })),
    mistakes: data?.mistakes ?? [],
  }
}

// Full JSON shape back out — every key present, matching the paste/export
// format, so a round trip is lossless.
function toPlantData(d: Draft): PlantData {
  return { ...d }
}

function move<T>(arr: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta
  if (j < 0 || j >= arr.length) return arr
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// ── Paste-import validation ───────────────────────────────────────────────
// Walks the known PlantData shape. Valid fields land in the returned draft;
// everything invalid, mistyped, or unrecognized is reported by name.

const isStr = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function importPlantJson(text: string): { draft: Draft; problems: string[] } {
  const problems: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Not valid JSON — check for missing quotes, commas, or brackets.')
  }
  if (!isObj(raw)) throw new Error('Expected a JSON object at the top level.')

  const draft = normalize(null)

  const takeStr = (key: keyof Draft & keyof PlantData) => {
    if (!(key in raw)) return
    const v = raw[key]
    if (isStr(v)) (draft[key] as string) = v
    else problems.push(`${key}: expected text`)
  }
  ;(['common_name', 'pronunciation', 'botanical_name', 'plant_type', 'photo_url', 'trim_summary', 'know_this_first'] as const).forEach(takeStr)

  const takeStrList = (key: 'spot_it' | 'mistakes') => {
    if (!(key in raw)) return
    const v = raw[key]
    if (!Array.isArray(v)) {
      problems.push(`${key}: expected a list of text lines`)
      return
    }
    draft[key] = v.filter(isStr)
    v.forEach((item, i) => {
      if (!isStr(item)) problems.push(`${key}[${i + 1}]: expected text`)
    })
  }
  takeStrList('spot_it')
  takeStrList('mistakes')

  for (const key of FACT_KEYS) {
    if (!(key in raw)) continue
    const v = raw[key]
    if (!isObj(v)) {
      problems.push(`${key}: expected { value, note }`)
      continue
    }
    if ('value' in v && !isStr(v.value)) problems.push(`${key}.value: expected text`)
    if ('note' in v && !isStr(v.note)) problems.push(`${key}.note: expected text`)
    draft[key] = {
      value: isStr(v.value) ? v.value : '',
      note: isStr(v.note) ? v.note : '',
    }
  }

  if ('steps' in raw) {
    if (!Array.isArray(raw.steps)) {
      problems.push('steps: expected a list')
    } else {
      draft.steps = []
      raw.steps.forEach((s, i) => {
        if (!isObj(s) || !isStr(s.title) || !isStr(s.body)) {
          problems.push(`steps[${i + 1}]: expected { title, body } as text (entry skipped)`)
          return
        }
        if ('why_label' in s && !isStr(s.why_label)) problems.push(`steps[${i + 1}].why_label: expected text`)
        if ('why' in s && !isStr(s.why)) problems.push(`steps[${i + 1}].why: expected text`)
        draft.steps.push({
          title: s.title,
          body: s.body,
          why_label: isStr(s.why_label) ? s.why_label : '',
          why: isStr(s.why) ? s.why : '',
        })
      })
    }
  }

  if ('tip_sections' in raw) {
    if (!Array.isArray(raw.tip_sections)) {
      problems.push('tip_sections: expected a list')
    } else {
      draft.tip_sections = []
      raw.tip_sections.forEach((s, i) => {
        if (!isObj(s) || !isStr(s.heading)) {
          problems.push(`tip_sections[${i + 1}]: expected { heading } as text (section skipped)`)
          return
        }
        if ('sub' in s && !isStr(s.sub)) problems.push(`tip_sections[${i + 1}].sub: expected text`)
        const cards: CardDraft[] = []
        if ('cards' in s) {
          if (!Array.isArray(s.cards)) {
            problems.push(`tip_sections[${i + 1}].cards: expected a list`)
          } else {
            s.cards.forEach((c, j) => {
              if (!isObj(c) || !isStr(c.title) || !isStr(c.body)) {
                problems.push(`tip_sections[${i + 1}].cards[${j + 1}]: expected { title, body } as text (card skipped)`)
                return
              }
              cards.push({ title: c.title, body: c.body })
            })
          }
        }
        draft.tip_sections.push({ heading: s.heading, sub: isStr(s.sub) ? s.sub : '', cards })
      })
    }
  }

  const known = new Set<string>([
    'common_name', 'pronunciation', 'botanical_name', 'plant_type', 'photo_url',
    'spot_it', 'mistakes', 'trim_summary', 'know_this_first', 'steps', 'tip_sections',
    ...FACT_KEYS,
  ])
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) problems.push(`${key}: unrecognized field (ignored)`)
  }
  if (!draft.common_name.trim()) problems.push('common_name: missing — required before saving')

  return { draft, problems }
}

// Same R2 upload path as the question bank and text pages.
async function uploadCertImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('prefix', 'cert-images')
  const res = await fetch('/api/upload-thumbnail', { method: 'POST', body: fd })
  const json = await res.json()
  if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
  return json.url
}

const INPUT =
  'w-full px-3 py-2 rounded-lg bg-white border border-plum/20 text-plum placeholder-plum/40 text-sm focus:outline-none focus:border-emerald-600'
const LBL = 'block text-xs font-medium text-plum/60 mb-1'
const SECTION_LBL = 'text-xs font-semibold uppercase tracking-[0.25em] text-plum/50'
const ADD_LINK = 'text-xs text-plum/50 hover:text-emerald-700 transition-colors'
const REMOVE_BTN = 'flex-shrink-0 text-xs text-red-600 hover:text-red-500 px-2 py-1 rounded hover:bg-red-500/10'

function MoveButtons({
  index,
  length,
  onMove,
}: {
  index: number
  length: number
  onMove: (delta: -1 | 1) => void
}) {
  return (
    <div className="flex flex-shrink-0 flex-col">
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Move up" className="px-1 leading-none text-plum/40 hover:text-plum/70 disabled:opacity-30">
        ▲
      </button>
      <button type="button" onClick={() => onMove(1)} disabled={index === length - 1} title="Move down" className="px-1 leading-none text-plum/40 hover:text-plum/70 disabled:opacity-30">
        ▼
      </button>
    </div>
  )
}

function StringListEditor({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string
  placeholder: string
  items: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div>
      <p className={`${SECTION_LBL} mb-2`}>{label}</p>
      <div className="space-y-1.5">
        {items.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <MoveButtons index={i} length={items.length} onMove={(d) => onChange(move(items, i, d))} />
            <input
              type="text"
              value={line}
              onChange={(e) => onChange(items.map((x, xi) => (xi === i ? e.target.value : x)))}
              placeholder={placeholder}
              className={INPUT}
            />
            <button type="button" onClick={() => onChange(items.filter((_, xi) => xi !== i))} className={REMOVE_BTN}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...items, ''])} className={`${ADD_LINK} mt-1.5`}>
        + Add line
      </button>
    </div>
  )
}

export default function PlantPageForm({
  pageId,
  initial,
  onSaved,
}: {
  pageId: string
  initial: PlantData | null
  onSaved: (commonName: string) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => normalize(initial))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importProblems, setImportProblems] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)

  function patch(p: Partial<Draft>) {
    setSaved(false)
    setDraft((prev) => ({ ...prev, ...p }))
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      patch({ photo_url: await uploadCertImage(file) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleImport() {
    setError(null)
    setImportProblems(null)
    try {
      const { draft: imported, problems } = importPlantJson(pasteText)
      // Imported copy never carries our uploaded photo — keep the current one
      // unless the JSON explicitly provides a URL.
      if (!imported.photo_url && draft.photo_url) imported.photo_url = draft.photo_url
      setSaved(false)
      setDraft(imported)
      setImportProblems(problems)
      if (problems.length === 0) {
        setPasteOpen(false)
        setPasteText('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  async function handleExport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(toPlantData(draft), null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not access the clipboard — copy from the paste box instead.')
      setPasteText(JSON.stringify(toPlantData(draft), null, 2))
      setPasteOpen(true)
    }
  }

  async function handleSave() {
    if (!draft.common_name.trim()) {
      setError('Plant name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateCertPlantPage(pageId, toPlantData(draft))
      setSaved(true)
      onSaved(draft.common_name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Import / export toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setPasteOpen((v) => !v); setImportProblems(null) }}
          className="rounded-full border border-plum/20 bg-white px-4 py-1.5 text-xs font-semibold text-plum/70 transition-colors hover:border-emerald-600 hover:text-emerald-700"
        >
          Paste plant copy
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-full border border-plum/20 bg-white px-4 py-1.5 text-xs font-semibold text-plum/70 transition-colors hover:border-emerald-600 hover:text-emerald-700"
        >
          Export JSON
        </button>
        {copied && <span className="text-xs font-medium text-emerald-700">Copied to clipboard</span>}
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="ml-auto rounded-full border border-plum/20 bg-white px-4 py-1.5 text-xs font-semibold text-plum/70 transition-colors hover:border-emerald-600 hover:text-emerald-700"
        >
          {showPreview ? 'Hide preview' : 'Show preview'}
        </button>
      </div>

      {pasteOpen && (
        <div className="space-y-2 rounded-xl border border-plum/15 bg-plum/5 p-3">
          <p className="text-xs text-plum/60">
            Paste the plant JSON (the Export JSON shape). Importing fills the form only — nothing
            is saved until you hit Save plant page.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            spellCheck={false}
            className={`${INPUT} font-mono text-xs`}
            placeholder='{ "common_name": "Arborvitae", ... }'
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={!pasteText.trim()}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            Fill form from JSON
          </button>
        </div>
      )}

      {importProblems && importProblems.length > 0 && (
        <div className="rounded-xl border border-burgundy/20 bg-burgundy/5 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-burgundy">
            Imported with problems — review these fields
          </p>
          <ul className="list-disc pl-5 text-sm text-plum/80">
            {importProblems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {/* Identity */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LBL}>Common name *</label>
          <input type="text" value={draft.common_name} onChange={(e) => patch({ common_name: e.target.value })} placeholder="e.g. Arborvitae" className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Pronunciation</label>
          <input type="text" value={draft.pronunciation} onChange={(e) => patch({ pronunciation: e.target.value })} placeholder="e.g. ar-bor-VY-tee" className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Botanical name</label>
          <input type="text" value={draft.botanical_name} onChange={(e) => patch({ botanical_name: e.target.value })} placeholder="e.g. Thuja occidentalis" className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Plant type</label>
          <input type="text" value={draft.plant_type} onChange={(e) => patch({ plant_type: e.target.value })} placeholder="e.g. Evergreen hedge" className={INPUT} />
        </div>
      </div>

      {/* Photo */}
      <div>
        <p className={`${SECTION_LBL} mb-2`}>Photo</p>
        <div className="flex items-center gap-3">
          {draft.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.photo_url} alt="" className="h-24 w-32 rounded-lg border border-plum/20 object-cover" />
          ) : (
            <div className="flex h-24 w-32 items-center justify-center rounded-lg border border-dashed border-plum/25 text-xs text-plum/40">
              No photo
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block cursor-pointer rounded bg-emerald-600/10 px-3 py-2 text-center text-xs text-emerald-700 hover:bg-emerald-600/15 hover:text-emerald-800">
              {uploading ? 'Uploading…' : draft.photo_url ? 'Replace photo' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} disabled={uploading} />
            </label>
            {draft.photo_url && (
              <button type="button" onClick={() => patch({ photo_url: '' })} className="block w-full text-xs text-plum/50 hover:text-plum/70">
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Spot it */}
      <StringListEditor
        label="How to spot it"
        placeholder="e.g. Flat, fan-shaped sprays of foliage"
        items={draft.spot_it}
        onChange={(spot_it) => patch({ spot_it })}
      />

      {/* Quick facts */}
      <div>
        <p className={`${SECTION_LBL} mb-2`}>Quick facts</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FACT_KEYS.map((key) => (
            <div key={key} className="rounded-xl border border-plum/10 bg-plum/5 p-3">
              <label className={LBL}>{FACT_LABEL[key]}</label>
              <input
                type="text"
                value={draft[key].value}
                onChange={(e) => patch({ [key]: { ...draft[key], value: e.target.value } } as Partial<Draft>)}
                placeholder="Value"
                className={INPUT}
              />
              <input
                type="text"
                value={draft[key].note}
                onChange={(e) => patch({ [key]: { ...draft[key], note: e.target.value } } as Partial<Draft>)}
                placeholder="Note (optional, shown smaller)"
                className={`${INPUT} mt-1.5`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Trim summary + rule box */}
      <div className="space-y-3">
        <div>
          <label className={LBL}>Trim summary (subtitle under &ldquo;How we trim it&rdquo;)</label>
          <input type="text" value={draft.trim_summary} onChange={(e) => patch({ trim_summary: e.target.value })} placeholder="e.g. Flat top, straight sides, slight taper…" className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Know this first (callout — **bold** is supported)</label>
          <textarea value={draft.know_this_first} onChange={(e) => patch({ know_this_first: e.target.value })} rows={3} placeholder="**Green grows back. Brown doesn't.** …" className={INPUT} />
        </div>
      </div>

      {/* Steps */}
      <div>
        <p className={`${SECTION_LBL} mb-2`}>Trim steps</p>
        <div className="space-y-2.5">
          {draft.steps.map((step, i) => (
            <div key={i} className="rounded-xl border border-plum/10 bg-plum/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <MoveButtons index={i} length={draft.steps.length} onMove={(d) => patch({ steps: move(draft.steps, i, d) })} />
                <span className="text-xs font-semibold text-plum/50">Step {i + 1}</span>
                <button type="button" onClick={() => patch({ steps: draft.steps.filter((_, xi) => xi !== i) })} className={`${REMOVE_BTN} ml-auto`}>
                  Remove
                </button>
              </div>
              <input
                type="text"
                value={step.title}
                onChange={(e) => patch({ steps: draft.steps.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)) })}
                placeholder="Step title"
                className={INPUT}
              />
              <textarea
                value={step.body}
                onChange={(e) => patch({ steps: draft.steps.map((x, xi) => (xi === i ? { ...x, body: e.target.value } : x)) })}
                rows={2}
                placeholder="What to do (**bold** supported)"
                className={`${INPUT} mt-1.5`}
              />
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[180px_1fr]">
                <input
                  type="text"
                  value={step.why_label}
                  onChange={(e) => patch({ steps: draft.steps.map((x, xi) => (xi === i ? { ...x, why_label: e.target.value } : x)) })}
                  placeholder="Why label (optional)"
                  className={INPUT}
                />
                <input
                  type="text"
                  value={step.why}
                  onChange={(e) => patch({ steps: draft.steps.map((x, xi) => (xi === i ? { ...x, why: e.target.value } : x)) })}
                  placeholder="Why it matters (optional)"
                  className={INPUT}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => patch({ steps: [...draft.steps, { title: '', body: '', why_label: '', why: '' }] })}
          className={`${ADD_LINK} mt-1.5`}
        >
          + Add step
        </button>
      </div>

      {/* Tip sections */}
      <div>
        <p className={`${SECTION_LBL} mb-2`}>Tip sections</p>
        <div className="space-y-3">
          {draft.tip_sections.map((section, si) => (
            <div key={si} className="rounded-xl border border-plum/10 bg-plum/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <MoveButtons index={si} length={draft.tip_sections.length} onMove={(d) => patch({ tip_sections: move(draft.tip_sections, si, d) })} />
                <span className="text-xs font-semibold text-plum/50">Section {si + 1}</span>
                <button type="button" onClick={() => patch({ tip_sections: draft.tip_sections.filter((_, xi) => xi !== si) })} className={`${REMOVE_BTN} ml-auto`}>
                  Remove section
                </button>
              </div>
              <input
                type="text"
                value={section.heading}
                onChange={(e) => patch({ tip_sections: draft.tip_sections.map((x, xi) => (xi === si ? { ...x, heading: e.target.value } : x)) })}
                placeholder="Section heading, e.g. Good to know"
                className={INPUT}
              />
              <input
                type="text"
                value={section.sub}
                onChange={(e) => patch({ tip_sections: draft.tip_sections.map((x, xi) => (xi === si ? { ...x, sub: e.target.value } : x)) })}
                placeholder="Subtitle (optional)"
                className={`${INPUT} mt-1.5`}
              />
              <div className="mt-2.5 space-y-2">
                {section.cards.map((card, ci) => (
                  <div key={ci} className="rounded-lg border border-plum/10 bg-white p-2.5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <MoveButtons
                        index={ci}
                        length={section.cards.length}
                        onMove={(d) =>
                          patch({ tip_sections: draft.tip_sections.map((x, xi) => (xi === si ? { ...x, cards: move(x.cards, ci, d) } : x)) })
                        }
                      />
                      <span className="text-[11px] font-semibold text-plum/40">Card {ci + 1}</span>
                      <button
                        type="button"
                        onClick={() =>
                          patch({ tip_sections: draft.tip_sections.map((x, xi) => (xi === si ? { ...x, cards: x.cards.filter((_, ci2) => ci2 !== ci) } : x)) })
                        }
                        className={`${REMOVE_BTN} ml-auto`}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={card.title}
                      onChange={(e) =>
                        patch({
                          tip_sections: draft.tip_sections.map((x, xi) =>
                            xi === si ? { ...x, cards: x.cards.map((c, ci2) => (ci2 === ci ? { ...c, title: e.target.value } : c)) } : x
                          ),
                        })
                      }
                      placeholder="Card title"
                      className={INPUT}
                    />
                    <textarea
                      value={card.body}
                      onChange={(e) =>
                        patch({
                          tip_sections: draft.tip_sections.map((x, xi) =>
                            xi === si ? { ...x, cards: x.cards.map((c, ci2) => (ci2 === ci ? { ...c, body: e.target.value } : c)) } : x
                          ),
                        })
                      }
                      rows={2}
                      placeholder="Card body (**bold** supported)"
                      className={`${INPUT} mt-1.5`}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  patch({ tip_sections: draft.tip_sections.map((x, xi) => (xi === si ? { ...x, cards: [...x.cards, { title: '', body: '' }] } : x)) })
                }
                className={`${ADD_LINK} mt-1.5`}
              >
                + Add card
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => patch({ tip_sections: [...draft.tip_sections, { heading: '', sub: '', cards: [] }] })}
          className={`${ADD_LINK} mt-1.5`}
        >
          + Add tip section
        </button>
      </div>

      {/* Mistakes */}
      <StringListEditor
        label="Miss these and it shows"
        placeholder="e.g. Visible waves or high spots"
        items={draft.mistakes}
        onChange={(mistakes) => patch({ mistakes })}
      />

      {/* Save */}
      <div className="flex items-center gap-3 border-t border-plum/10 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save plant page'}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved</span>}
      </div>

      {/* Live preview on a tan swatch, exactly what the learner sees */}
      {showPreview && (
        <div className="rounded-2xl border border-plum/15 bg-tan p-4 sm:p-6">
          <p className={`${SECTION_LBL} mb-4`}>Preview</p>
          <PlantPage plant={toPlantData(draft)} />
        </div>
      )}
    </div>
  )
}
