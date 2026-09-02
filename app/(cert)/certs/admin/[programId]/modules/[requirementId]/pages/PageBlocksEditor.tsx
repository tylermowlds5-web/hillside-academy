'use client'

import { useState } from 'react'
import type { PageBlock, PhotoAspect } from '@/lib/types'
import PageBlocks from '@/components/cert/PageBlocks'
import { saveCertTextPage } from '@/app/cert-admin-actions'
import {
  compactFraming,
  DEFAULT_FRAMING,
  framingOf,
  PHOTO_ASPECTS,
  photoAspect,
  photoFrameStyle,
  type PhotoFraming,
} from '@/lib/photo-framing'
import RichTextEditor from '../../../../RichTextEditor'
import PhotoFrameEditor from './PhotoFrameEditor'
import { newKey, SortableList, SortableRow } from './sortable'

// ── Text page block editor ────────────────────────────────────────────────
// Builds a text page as an ordered list of blocks (section headings, rich
// text, cards, callouts, bullet lists, photo groups) rendered for learners
// by components/cert/PageBlocks in the plant-page style. Blocks add,
// remove, and drag-reorder; bullet lines and photos drag within their
// block. Legacy pages (rich body + one image, no blocks yet) auto-convert
// to starter blocks in the editor — nothing changes in the DB until saved.
// Draft rows carry client-only keys for dnd, stripped on save.

type LineRow = { key: string; text: string }
// framing = non-destructive crop (focus point, zoom, fill vs. show whole).
type PhotoRow = { key: string; url: string; caption: string; framing: PhotoFraming }

type BlockDraft =
  | { key: string; type: 'heading'; text: string; sub: string }
  | { key: string; type: 'richtext'; html: string }
  | { key: string; type: 'card'; title: string; body: string }
  | { key: string; type: 'callout'; label: string; body: string }
  | { key: string; type: 'bullets'; items: LineRow[] }
  // aspect undefined = auto (wide for one photo, standard for a grid).
  | { key: string; type: 'photos'; photos: PhotoRow[]; aspect?: PhotoAspect }

const newPhotoRow = (url: string): PhotoRow => ({ key: newKey(), url, caption: '', framing: DEFAULT_FRAMING })

// The frame shape a photos block renders with (mirrors PageBlocks).
function blockAspect(block: Extract<BlockDraft, { type: 'photos' }>) {
  return photoAspect(block.aspect, block.photos.length === 1 ? 'wide' : 'standard')
}

const BLOCK_LABEL: Record<BlockDraft['type'], string> = {
  heading: 'Section heading',
  richtext: 'Text',
  card: 'Card',
  callout: 'Callout',
  bullets: 'Bullet list',
  photos: 'Photos',
}

function emptyBlock(type: BlockDraft['type']): BlockDraft {
  const key = newKey()
  switch (type) {
    case 'heading': return { key, type, text: '', sub: '' }
    case 'richtext': return { key, type, html: '' }
    case 'card': return { key, type, title: '', body: '' }
    case 'callout': return { key, type, label: '', body: '' }
    case 'bullets': return { key, type, items: [] }
    case 'photos': return { key, type, photos: [] }
  }
}

function normalizeBlocks(
  blocks: PageBlock[] | null,
  legacyBody: string,
  legacyImageUrl: string | null
): BlockDraft[] {
  if (blocks && blocks.length > 0) {
    return blocks.map((b) => {
      const key = newKey()
      switch (b.type) {
        case 'heading': return { key, type: 'heading', text: b.text ?? '', sub: b.sub ?? '' }
        case 'richtext': return { key, type: 'richtext', html: b.html ?? '' }
        case 'card': return { key, type: 'card', title: b.title ?? '', body: b.body ?? '' }
        case 'callout': return { key, type: 'callout', label: b.label ?? '', body: b.body ?? '' }
        case 'bullets': return { key, type: 'bullets', items: (b.items ?? []).map((text) => ({ key: newKey(), text })) }
        case 'photos':
          return {
            key,
            type: 'photos',
            aspect: b.aspect,
            photos: (b.photos ?? []).map((p) => ({ key: newKey(), url: p.url, caption: p.caption ?? '', framing: framingOf(p) })),
          }
      }
    })
  }
  // Legacy page: seed blocks from the old single-body content so nothing
  // is lost when upgrading.
  const seeded: BlockDraft[] = []
  if (legacyBody.trim()) seeded.push({ key: newKey(), type: 'richtext', html: legacyBody })
  if (legacyImageUrl) {
    seeded.push({ key: newKey(), type: 'photos', photos: [newPhotoRow(legacyImageUrl)] })
  }
  return seeded
}

function toBlocks(drafts: BlockDraft[]): PageBlock[] {
  return drafts.map((b): PageBlock => {
    switch (b.type) {
      case 'heading': return { type: 'heading', text: b.text, sub: b.sub }
      case 'richtext': return { type: 'richtext', html: b.html }
      case 'card': return { type: 'card', title: b.title, body: b.body }
      case 'callout': return { type: 'callout', label: b.label, body: b.body }
      case 'bullets': return { type: 'bullets', items: b.items.map((l) => l.text) }
      case 'photos':
        return {
          type: 'photos',
          ...(b.aspect ? { aspect: b.aspect } : {}),
          photos: b.photos.map(({ url, caption, framing }) => ({ url, caption, ...compactFraming(framing) })),
        }
    }
  })
}

// Same R2 upload path as the question bank and the plant form.
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
const SECTION_LBL = 'text-xs font-semibold uppercase tracking-[0.25em] text-plum/50'
const ADD_LINK = 'text-xs text-plum/50 hover:text-emerald-700 transition-colors'
const REMOVE_BTN = 'flex-shrink-0 text-xs text-red-600 hover:text-red-500 px-2 py-1 rounded hover:bg-red-500/10'

export default function PageBlocksEditor({
  pageId,
  initialTitle,
  legacyBody,
  legacyImageUrl,
  initialBlocks,
  onSaved,
  onClose,
}: {
  pageId: string
  initialTitle: string
  legacyBody: string
  legacyImageUrl: string | null
  initialBlocks: PageBlock[] | null
  // Receives the saved payload so the host list can patch its local state —
  // the editor remounts from that state on reopen.
  onSaved: (title: string, blocks: PageBlock[]) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [blocks, setBlocks] = useState<BlockDraft[]>(() =>
    normalizeBlocks(initialBlocks, legacyBody, legacyImageUrl)
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  // Photo currently open in the framing dialog (block index + photo index).
  const [adjusting, setAdjusting] = useState<{ block: number; photo: number } | null>(null)

  const adjustingBlock =
    adjusting !== null && blocks[adjusting.block]?.type === 'photos'
      ? (blocks[adjusting.block] as Extract<BlockDraft, { type: 'photos' }>)
      : null
  const adjustingPhoto = adjustingBlock && adjusting ? adjustingBlock.photos[adjusting.photo] ?? null : null

  function setPhotoFraming(bi: number, pi: number, framing: PhotoFraming) {
    touch()
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === bi && b.type === 'photos'
          ? { ...b, photos: b.photos.map((p, j) => (j === pi ? { ...p, framing } : p)) }
          : b
      )
    )
  }

  function touch() {
    setSaved(false)
    setDirty(true)
  }

  function updateBlock(idx: number, next: BlockDraft) {
    touch()
    setBlocks((prev) => prev.map((b, i) => (i === idx ? next : b)))
  }

  function removeBlock(idx: number) {
    touch()
    setBlocks((prev) => prev.filter((_, i) => i !== idx))
  }

  function addBlock(type: BlockDraft['type']) {
    touch()
    setBlocks((prev) => [...prev, emptyBlock(type)])
  }

  async function handlePhotos(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of files) {
        const url = await uploadCertImage(file)
        touch()
        setBlocks((prev) =>
          prev.map((b, i) =>
            i === idx && b.type === 'photos'
              ? { ...b, photos: [...b.photos, newPhotoRow(url)] }
              : b
          )
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    setError(null)
    try {
      const payload = { title: title.trim(), blocks: toBlocks(blocks) }
      await saveCertTextPage(pageId, payload)
      setSaved(true)
      setDirty(false)
      onSaved(payload.title, payload.blocks)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAndClose() {
    if (await save()) onClose()
  }

  function handleClose() {
    if (dirty && !confirm('Close without saving? Your unsaved changes will be lost.')) return
    onClose()
  }

  const actionBar = (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        onClick={handleSaveAndClose}
        disabled={saving || uploading}
        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save & close'}
      </button>
      <button
        type="button"
        onClick={save}
        disabled={saving || uploading}
        className="rounded-full border border-emerald-600/50 px-5 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-600/10 disabled:opacity-60"
      >
        Save
      </button>
      <button
        type="button"
        onClick={handleClose}
        disabled={saving}
        className="rounded-full border border-plum/15 px-5 py-2 text-sm font-semibold text-plum/70 transition-colors hover:border-plum/30 hover:text-plum disabled:opacity-60"
      >
        Close
      </button>
      {saved && <span className="text-sm text-emerald-700">Saved</span>}
      <button
        type="button"
        onClick={() => setShowPreview((v) => !v)}
        className="ml-auto rounded-full border border-plum/20 bg-white px-4 py-1.5 text-xs font-semibold text-plum/70 transition-colors hover:border-emerald-600 hover:text-emerald-700"
      >
        {showPreview ? 'Hide preview' : 'Show preview'}
      </button>
    </div>
  )

  return (
    <div className="space-y-5">
      {actionBar}

      {showPreview && (
        <div className="rounded-2xl border border-plum/15 bg-tan p-4 sm:p-6">
          <p className={`${SECTION_LBL} mb-4`}>Preview</p>
          {title.trim() && (
            <h2 className="mb-4 font-serif text-xl font-semibold text-plum sm:text-2xl">{title}</h2>
          )}
          <PageBlocks blocks={toBlocks(blocks)} alt={title.trim() || 'Page'} />
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div>
        <label className="block text-xs font-medium text-plum/60 mb-1">Page title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => { touch(); setTitle(e.target.value) }}
          placeholder="e.g. Reading a plant tag"
          className={INPUT}
        />
      </div>

      {blocks.length === 0 && (
        <p className="rounded-xl border border-dashed border-plum/20 px-4 py-6 text-center text-sm text-plum/50">
          No content yet — add your first block below. Mix headings, text, cards, callouts,
          bullet lists, and photos in any order.
        </p>
      )}

      <SortableList items={blocks} onReorder={(next) => { touch(); setBlocks(next) }} className="space-y-2.5">
        {blocks.map((block, bi) => (
          <SortableRow key={block.key} id={block.key} className="rounded-xl border border-plum/10 bg-plum/5 p-3">
            {(handle) => (
              <>
                <div className="mb-2 flex items-center gap-2">
                  {handle}
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-plum/10 text-plum/60 px-2 py-0.5 rounded-full">
                    {BLOCK_LABEL[block.type]}
                  </span>
                  {block.type === 'photos' && (
                    <label className="ml-2 flex items-center gap-1.5 text-[11px] text-plum/60">
                      Frame
                      <select
                        value={block.aspect ?? 'auto'}
                        onChange={(e) =>
                          updateBlock(bi, {
                            ...block,
                            aspect: e.target.value === 'auto' ? undefined : (e.target.value as PhotoAspect),
                          })
                        }
                        className="rounded-md border border-plum/20 bg-white px-1.5 py-0.5 text-[11px] text-plum focus:border-emerald-600 focus:outline-none"
                      >
                        <option value="auto">
                          Auto ({block.photos.length === 1 ? 'wide' : 'standard'})
                        </option>
                        {PHOTO_ASPECTS.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button type="button" onClick={() => removeBlock(bi)} className={`${REMOVE_BTN} ml-auto`}>
                    Remove
                  </button>
                </div>

                {block.type === 'heading' && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={block.text}
                      onChange={(e) => updateBlock(bi, { ...block, text: e.target.value })}
                      placeholder="Section heading, e.g. Watering in summer"
                      className={INPUT}
                    />
                    <input
                      type="text"
                      value={block.sub}
                      onChange={(e) => updateBlock(bi, { ...block, sub: e.target.value })}
                      placeholder="Subtitle (optional)"
                      className={INPUT}
                    />
                  </div>
                )}

                {block.type === 'richtext' && (
                  <RichTextEditor
                    initialHtml={block.html}
                    onChange={(html) => updateBlock(bi, { ...block, html })}
                  />
                )}

                {block.type === 'card' && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={block.title}
                      onChange={(e) => updateBlock(bi, { ...block, title: e.target.value })}
                      placeholder="Card title (optional)"
                      className={INPUT}
                    />
                    <textarea
                      value={block.body}
                      onChange={(e) => updateBlock(bi, { ...block, body: e.target.value })}
                      rows={2}
                      placeholder="Card body (**bold** supported)"
                      className={INPUT}
                    />
                  </div>
                )}

                {block.type === 'callout' && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={block.label}
                      onChange={(e) => updateBlock(bi, { ...block, label: e.target.value })}
                      placeholder="Label, e.g. Know this first (optional)"
                      className={INPUT}
                    />
                    <textarea
                      value={block.body}
                      onChange={(e) => updateBlock(bi, { ...block, body: e.target.value })}
                      rows={2}
                      placeholder="Callout text (**bold** supported)"
                      className={INPUT}
                    />
                  </div>
                )}

                {block.type === 'bullets' && (
                  <div>
                    <SortableList
                      items={block.items}
                      onReorder={(items) => updateBlock(bi, { ...block, items })}
                      className="space-y-1.5"
                    >
                      {block.items.map((line, li) => (
                        <SortableRow key={line.key} id={line.key} className="flex items-center gap-2">
                          {(lineHandle) => (
                            <>
                              {lineHandle}
                              <input
                                type="text"
                                value={line.text}
                                onChange={(e) =>
                                  updateBlock(bi, { ...block, items: block.items.map((x, xi) => (xi === li ? { ...x, text: e.target.value } : x)) })
                                }
                                placeholder="Bullet point"
                                className={INPUT}
                              />
                              <button
                                type="button"
                                onClick={() => updateBlock(bi, { ...block, items: block.items.filter((_, xi) => xi !== li) })}
                                className={REMOVE_BTN}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </SortableRow>
                      ))}
                    </SortableList>
                    <button
                      type="button"
                      onClick={() => updateBlock(bi, { ...block, items: [...block.items, { key: newKey(), text: '' }] })}
                      className={`${ADD_LINK} mt-1.5`}
                    >
                      + Add bullet
                    </button>
                  </div>
                )}

                {block.type === 'photos' && (
                  <div>
                    <SortableList
                      items={block.photos}
                      onReorder={(photos) => updateBlock(bi, { ...block, photos })}
                      className="space-y-2"
                    >
                      {block.photos.map((photo, pi) => (
                        <SortableRow key={photo.key} id={photo.key} className="flex items-center gap-2 rounded-lg border border-plum/10 bg-white p-2">
                          {(photoHandle) => (
                            <>
                              {photoHandle}
                              <button
                                type="button"
                                onClick={() => setAdjusting({ block: bi, photo: pi })}
                                title="Adjust framing"
                                className={`relative h-16 flex-shrink-0 overflow-hidden rounded-lg border border-plum/20 bg-plum/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                                  blockAspect(block).ratio >= 1 ? 'w-24' : 'w-12'
                                }`}
                                style={{ aspectRatio: blockAspect(block).ratio }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo.url} alt="" className="absolute inset-0 h-full w-full" style={photoFrameStyle(photo.framing)} />
                              </button>
                              <input
                                type="text"
                                value={photo.caption}
                                onChange={(e) =>
                                  updateBlock(bi, { ...block, photos: block.photos.map((x, xi) => (xi === pi ? { ...x, caption: e.target.value } : x)) })
                                }
                                placeholder="Caption (optional)"
                                className={INPUT}
                              />
                              <button
                                type="button"
                                onClick={() => setAdjusting({ block: bi, photo: pi })}
                                className="flex-shrink-0 rounded px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-600/10"
                              >
                                Adjust
                              </button>
                              <button
                                type="button"
                                onClick={() => updateBlock(bi, { ...block, photos: block.photos.filter((_, xi) => xi !== pi) })}
                                className={REMOVE_BTN}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </SortableRow>
                      ))}
                    </SortableList>
                    <label className="mt-2 inline-block cursor-pointer rounded bg-emerald-600/10 px-3 py-2 text-center text-xs text-emerald-700 hover:bg-emerald-600/15 hover:text-emerald-800">
                      {uploading ? 'Uploading…' : block.photos.length > 0 ? 'Add photos' : 'Upload photos'}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handlePhotos(bi, e)} disabled={uploading} />
                    </label>
                  </div>
                )}
              </>
            )}
          </SortableRow>
        ))}
      </SortableList>

      {/* Add-block chooser */}
      <div>
        <p className={`${SECTION_LBL} mb-2`}>Add a block</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(BLOCK_LABEL) as BlockDraft['type'][]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(type)}
              className="rounded-full border border-plum/20 bg-white px-4 py-2 text-sm font-medium text-plum/80 transition-colors hover:border-emerald-600 hover:text-emerald-700"
            >
              {BLOCK_LABEL[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-plum/10 pt-4">{actionBar}</div>

      {adjusting && adjustingBlock && adjustingPhoto && (
        <PhotoFrameEditor
          url={adjustingPhoto.url}
          initial={adjustingPhoto.framing}
          ratio={blockAspect(adjustingBlock).ratio}
          frameLabel={blockAspect(adjustingBlock).label}
          onDone={(framing) => {
            setPhotoFraming(adjusting.block, adjusting.photo, framing)
            setAdjusting(null)
          }}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  )
}
