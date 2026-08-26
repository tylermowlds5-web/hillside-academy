import type { ReactNode } from 'react'
import type { PlantData } from '@/lib/types'

export type { PlantData, PlantStep, PlantTipSection } from '@/lib/types'

// ── Plant reference page ──────────────────────────────────────────────────
// Renders one plant's ID-and-trimming reference (the arborvitae mock,
// arborvitae-plant-page-v2.html) from a plant_data JSON object. Pure
// presentation, no data fetching — pass the parsed JSON in. Restyled from
// the mock's hardcoded hexes onto the cert design tokens (plum / tan /
// burgundy / Hillside emerald) so it sits natively in the /certs light
// theme. Every optional field and empty array hides its row or section
// entirely — no empty boxes or orphan headings. The only markup honored in
// body strings is **bold** (rendered as <strong>); everything else is
// plain text.

const has = (s: string | undefined | null): s is string => !!s && s.trim() !== ''

// **bold** → <strong>; no other markup. React escapes everything else, so
// stray HTML in the data renders as literal text.
function renderBold(text: string, strongClass = 'font-semibold text-plum'): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className={strongClass}>
        {part}
      </strong>
    ) : (
      part
    )
  )
}

const LABEL = 'font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-plum/50'

export default function PlantPage({ plant }: { plant: PlantData }) {
  // Backward compat: legacy single photo_url counts as the one primary
  // photo when the photos array is empty.
  const photos = (plant.photos ?? []).filter((p) => has(p.url))
  if (photos.length === 0 && has(plant.photo_url)) {
    photos.push({ url: plant.photo_url })
  }
  const primary = photos[0] ?? null
  const gallery = photos.slice(1)

  const spotIt = (plant.spot_it ?? []).filter(has)
  const facts = [
    { label: 'Also called', field: plant.also_called, full: false },
    { label: 'Mature size', field: plant.mature_size, full: false },
    { label: 'Tools', field: plant.tools, full: true },
    { label: 'When we trim it', field: plant.when_we_trim, full: true },
  ].filter((f) => has(f.field?.value))
  const steps = plant.steps ?? []
  const tipSections = (plant.tip_sections ?? []).filter((s) => s.cards.length > 0)
  const mistakes = (plant.mistakes ?? []).filter(has)

  const hasMedia = primary !== null || spotIt.length > 0
  const hasTrimSection = has(plant.trim_summary) || has(plant.know_this_first) || steps.length > 0

  return (
    <div className="space-y-10">
      {/* ── Top card: name, ID marks, quick facts (+ gallery strip) ── */}
      <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-plum/10 bg-white shadow-sm">
        <div className="border-b border-plum/5 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <h1 className="font-serif text-3xl font-semibold text-plum sm:text-4xl">
            {plant.common_name}
          </h1>
          {has(plant.pronunciation) && (
            <p className="mt-0.5 font-mono text-sm text-plum/50">{plant.pronunciation}</p>
          )}
          {has(plant.botanical_name) && (
            <p className="mt-1 text-base italic text-plum/60">{plant.botanical_name}</p>
          )}
          {has(plant.plant_type) && (
            <span className="mt-3 inline-block rounded-full bg-emerald-600/10 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
              {plant.plant_type}
            </span>
          )}
        </div>

        {(hasMedia || facts.length > 0) && (
          <div className={`grid ${hasMedia ? 'sm:grid-cols-[260px_1fr]' : ''}`}>
            {hasMedia && (
              <div className="px-5 pt-5 sm:pb-5 sm:pl-6 sm:pr-0">
                {primary && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primary.url}
                    alt={has(primary.caption) ? primary.caption : plant.common_name}
                    className="aspect-[4/3] w-full rounded-lg border border-plum/10 object-cover"
                  />
                )}
                {spotIt.length > 0 && (
                  <div className={primary ? 'mt-3.5' : ''}>
                    <p className={`${LABEL} mb-2`}>How to spot it</p>
                    <ul className="space-y-1.5">
                      {spotIt.map((line, i) => (
                        <li key={i} className="relative pl-4 text-sm leading-snug text-plum">
                          <span className="absolute left-0 top-[7px] h-1.5 w-1.5 rounded-full bg-emerald-600/60" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {facts.length > 0 && (
              <dl className="grid grid-cols-1 content-start gap-0 px-5 pb-5 pt-2 sm:grid-cols-2 sm:px-6">
                {facts.map((f) => (
                  <div
                    key={f.label}
                    className={`border-b border-plum/5 py-4 pr-0 last:border-b-0 sm:pr-5 ${
                      f.full ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <dt className={`${LABEL} mb-1`}>{f.label}</dt>
                    <dd className="text-[15.5px] font-semibold leading-snug text-plum">
                      {f.field!.value}
                      {has(f.field!.note) && (
                        <small className="mt-0.5 block text-sm font-normal text-plum/60">
                          {f.field!.note}
                        </small>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>

      {/* Additional photos: captioned gallery strip, hidden with 0–1 photos */}
      {gallery.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gallery.map((photo, i) => (
            <figure
              key={i}
              className="overflow-hidden rounded-xl border border-plum/10 bg-white shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={has(photo.caption) ? photo.caption : plant.common_name}
                className="aspect-[4/3] w-full object-cover"
              />
              {has(photo.caption) && (
                <figcaption className="px-3 py-2 text-xs text-plum/60">{photo.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      </div>

      {/* ── How we trim it ── */}
      {hasTrimSection && (
        <section>
          <h2 className="font-serif text-xl font-semibold text-plum sm:text-2xl">How we trim it</h2>
          {has(plant.trim_summary) && (
            <p className="mt-1 text-[14.5px] text-plum/60">{plant.trim_summary}</p>
          )}

          {has(plant.know_this_first) && (
            <div className="mt-4 rounded-xl border border-burgundy/20 bg-burgundy/5 px-4 py-4 sm:px-5">
              <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-burgundy">
                Know this first
              </p>
              <p className="text-[15.5px] text-plum">
                {renderBold(plant.know_this_first!, 'font-bold text-plum')}
              </p>
            </div>
          )}

          {steps.length > 0 && (
            <ol className="mt-4 space-y-2.5">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[30px_1fr] items-start gap-3.5 rounded-xl border border-plum/10 bg-white px-4 py-4 shadow-sm sm:px-5"
                >
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600/10 font-mono text-[13px] font-semibold text-emerald-700">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[16.5px] font-bold text-plum">{step.title}</h3>
                    <p className="mt-0.5 text-[15px] text-plum">{renderBold(step.body)}</p>
                    {has(step.why) && (
                      <span className="mt-2 block border-l-2 border-plum/10 pl-3 text-sm text-plum/60">
                        {has(step.why_label) && (
                          <b className="font-semibold text-plum">{step.why_label}: </b>
                        )}
                        {renderBold(step.why!)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* ── Tip sections (reductions, good-to-know, …) — any count ── */}
      {tipSections.map((section, si) => (
        <section key={si}>
          <h2 className="font-serif text-xl font-semibold text-plum sm:text-2xl">
            {section.heading}
          </h2>
          {has(section.sub) && <p className="mt-1 text-[14.5px] text-plum/60">{section.sub}</p>}
          <div className="mt-4 grid gap-2.5">
            {section.cards.map((card, ci) => (
              <div
                key={ci}
                className="rounded-xl border border-plum/10 bg-white px-4 py-3.5 shadow-sm sm:px-5"
              >
                <h3 className="text-[15.5px] font-bold text-plum">{card.title}</h3>
                <p className="mt-0.5 text-sm text-plum/60">{renderBold(card.body)}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* ── Mistakes ── */}
      {mistakes.length > 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold text-plum sm:text-2xl">
            Miss these and it shows
          </h2>
          <ul className="mt-4 rounded-xl border border-plum/10 bg-white px-5 py-1.5 shadow-sm">
            {mistakes.map((line, i) => (
              <li
                key={i}
                className="relative border-b border-plum/5 py-3 pl-5 text-[15px] text-plum last:border-b-0 before:absolute before:left-0 before:top-[19px] before:h-0.5 before:w-2 before:rounded before:bg-burgundy/50 before:content-['']"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
