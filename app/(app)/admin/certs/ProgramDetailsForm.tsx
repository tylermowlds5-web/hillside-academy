'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveCertProgram, deleteCertProgram } from '@/app/cert-admin-actions'

// Create/edit form for a cert program's core fields. On create it redirects
// to the program editor; on edit it saves in place.
export default function ProgramDetailsForm({
  programId,
  initialName = '',
  initialDescription = '',
  initialValidityMonths = null,
  initialIsActive = true,
}: {
  programId?: string
  initialName?: string
  initialDescription?: string
  initialValidityMonths?: number | null
  initialIsActive?: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [validity, setValidity] = useState<string>(
    initialValidityMonths === null ? '' : String(initialValidityMonths)
  )
  const [isActive, setIsActive] = useState(initialIsActive)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!name.trim()) {
      setError('Program name is required')
      return
    }
    const months = validity.trim() === '' ? null : parseInt(validity, 10)
    if (months !== null && (isNaN(months) || months < 1)) {
      setError('Validity must be a positive number of months (or blank for never expires)')
      return
    }

    setSaving(true)
    try {
      const { id } = await saveCertProgram({
        programId,
        name,
        description,
        validityMonths: months,
        isActive,
      })
      if (!programId) {
        router.push(`/admin/certs/${id}`)
        return
      }
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!programId) return
    if (!confirm('Delete this certification program? Modules, question banks, attempts, and enrollment all go with it. This cannot be undone.')) return
    setSaving(true)
    try {
      await deleteCertProgram(programId)
      router.push('/admin/certs')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Program Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Plant Care Fundamentals — Level 1"
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What does this certification cover?"
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 resize-none"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Valid for (months)
          </label>
          <input
            type="number"
            min={1}
            value={validity}
            onChange={(e) => setValidity(e.target.value)}
            placeholder="Never expires"
            className="w-40 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
          />
          <p className="text-[11px] text-zinc-600 mt-1">Blank = credential never expires</p>
        </div>

        <label className="flex items-center gap-2.5 pb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
          />
          <span className="text-sm text-zinc-300">
            Active <span className="text-zinc-500">(visible to employees)</span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : programId ? 'Save details' : 'Create program'}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
        {programId && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="ml-auto text-sm text-red-500 hover:text-red-400 px-3 py-2 rounded hover:bg-red-500/10 transition-colors"
          >
            Delete program
          </button>
        )}
      </div>
    </form>
  )
}
