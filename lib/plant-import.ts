import type { PlantData, PlantStep, PlantTipSection } from './types'
import { compactFraming, framingOf } from './photo-framing'

// ── Plant JSON validation ─────────────────────────────────────────────────
// THE validator for plant_data coming in as JSON — used by "Paste plant
// copy" on the plant form, by the bulk importer, and re-run server-side
// before bulk rows are inserted. Walks the known PlantData shape: valid
// fields land in the returned data; everything invalid, mistyped, or
// unrecognized is reported by name so nothing is silently dropped. Pure
// (no DOM, no React) so it runs anywhere.

export const PLANT_FACT_KEYS = ['also_called', 'mature_size', 'tools', 'when_we_trim'] as const

const isStr = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export type PlantParseResult = { data: PlantData; problems: string[] }

// Parses text as JSON with a friendlier error than JSON.parse's.
export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Not valid JSON — check for missing quotes, commas, or brackets.')
  }
}

export function parsePlantObject(raw: unknown): PlantParseResult {
  const problems: string[] = []
  const data: PlantData = { common_name: '' }
  if (!isObj(raw)) return { data, problems: ['Expected a JSON object.'] }

  const takeStr = (
    key: 'common_name' | 'pronunciation' | 'botanical_name' | 'plant_type' | 'trim_summary' | 'know_this_first'
  ) => {
    if (!(key in raw)) return
    const v = raw[key]
    if (isStr(v)) data[key] = v
    else problems.push(`${key}: expected text`)
  }
  ;(['common_name', 'pronunciation', 'botanical_name', 'plant_type', 'trim_summary', 'know_this_first'] as const).forEach(takeStr)

  if ('photos' in raw) {
    if (!Array.isArray(raw.photos)) {
      problems.push('photos: expected a list of { url, caption }')
    } else {
      data.photos = []
      raw.photos.forEach((p, i) => {
        if (!isObj(p) || !isStr(p.url) || !p.url) {
          problems.push(`photos[${i + 1}]: expected { url } as text (photo skipped)`)
          return
        }
        if ('caption' in p && !isStr(p.caption)) problems.push(`photos[${i + 1}].caption: expected text`)
        if ('fit' in p && p.fit !== 'cover' && p.fit !== 'contain') problems.push(`photos[${i + 1}].fit: expected "cover" or "contain"`)
        ;(['focus_x', 'focus_y', 'zoom'] as const).forEach((k) => {
          if (k in p && typeof p[k] !== 'number') problems.push(`photos[${i + 1}].${k}: expected a number`)
        })
        data.photos!.push({ url: p.url, caption: isStr(p.caption) ? p.caption : '', ...compactFraming(framingOf(p)) })
      })
    }
  }
  // Legacy shape: a bare photo_url becomes the primary photo when no photos
  // list was given.
  if ('photo_url' in raw) {
    if (!isStr(raw.photo_url)) problems.push('photo_url: expected text')
    else if (raw.photo_url && (data.photos ?? []).length === 0) {
      data.photos = [{ url: raw.photo_url, caption: '' }]
    }
  }

  const takeStrList = (key: 'spot_it' | 'mistakes') => {
    if (!(key in raw)) return
    const v = raw[key]
    if (!Array.isArray(v)) {
      problems.push(`${key}: expected a list of text lines`)
      return
    }
    data[key] = v.filter(isStr)
    v.forEach((item, i) => {
      if (!isStr(item)) problems.push(`${key}[${i + 1}]: expected text`)
    })
  }
  takeStrList('spot_it')
  takeStrList('mistakes')

  for (const key of PLANT_FACT_KEYS) {
    if (!(key in raw)) continue
    const v = raw[key]
    if (!isObj(v)) {
      problems.push(`${key}: expected { value, note }`)
      continue
    }
    if ('value' in v && !isStr(v.value)) problems.push(`${key}.value: expected text`)
    if ('note' in v && !isStr(v.note)) problems.push(`${key}.note: expected text`)
    data[key] = { value: isStr(v.value) ? v.value : '', note: isStr(v.note) ? v.note : '' }
  }

  if ('steps' in raw) {
    if (!Array.isArray(raw.steps)) {
      problems.push('steps: expected a list')
    } else {
      const steps: PlantStep[] = []
      raw.steps.forEach((s, i) => {
        if (!isObj(s) || !isStr(s.title) || !isStr(s.body)) {
          problems.push(`steps[${i + 1}]: expected { title, body } as text (entry skipped)`)
          return
        }
        if ('why_label' in s && !isStr(s.why_label)) problems.push(`steps[${i + 1}].why_label: expected text`)
        if ('why' in s && !isStr(s.why)) problems.push(`steps[${i + 1}].why: expected text`)
        steps.push({
          title: s.title,
          body: s.body,
          why_label: isStr(s.why_label) ? s.why_label : '',
          why: isStr(s.why) ? s.why : '',
        })
      })
      data.steps = steps
    }
  }

  if ('tip_sections' in raw) {
    if (!Array.isArray(raw.tip_sections)) {
      problems.push('tip_sections: expected a list')
    } else {
      const sections: PlantTipSection[] = []
      raw.tip_sections.forEach((s, i) => {
        if (!isObj(s) || !isStr(s.heading)) {
          problems.push(`tip_sections[${i + 1}]: expected { heading } as text (section skipped)`)
          return
        }
        if ('sub' in s && !isStr(s.sub)) problems.push(`tip_sections[${i + 1}].sub: expected text`)
        const cards: { title: string; body: string }[] = []
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
        sections.push({ heading: s.heading, sub: isStr(s.sub) ? s.sub : '', cards })
      })
      data.tip_sections = sections
    }
  }

  const known = new Set<string>([
    'common_name', 'pronunciation', 'botanical_name', 'plant_type', 'photos', 'photo_url',
    'spot_it', 'mistakes', 'trim_summary', 'know_this_first', 'steps', 'tip_sections',
    ...PLANT_FACT_KEYS,
  ])
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) problems.push(`${key}: unrecognized field (ignored)`)
  }
  if (!data.common_name.trim()) problems.push('common_name: missing — required before saving')

  return { data, problems }
}

// ── Bulk input ────────────────────────────────────────────────────────────
// A bulk source is either one plant object or an array of them. Files each
// hold one plant (an array inside a file is accepted and spread too).

export type BulkPlantEntry = {
  // Where it came from, for the preview list: a file name or "Pasted #n".
  source: string
  name: string
  data: PlantData
  problems: string[]
}

export function parseBulkPlantSource(raw: unknown, sourceLabel: string): BulkPlantEntry[] {
  const items = Array.isArray(raw) ? raw : [raw]
  return items.map((item, i) => {
    const { data, problems } = parsePlantObject(item)
    const label = Array.isArray(raw) ? `${sourceLabel} #${i + 1}` : sourceLabel
    return {
      source: label,
      name: data.common_name.trim() || `(unnamed — ${label})`,
      data,
      problems,
    }
  })
}
