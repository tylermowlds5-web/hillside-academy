'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startCertRenewal } from '@/app/cert-actions'

// "Start renewal" button on an expired cert. Warns that renewal means
// re-taking the whole course, then calls the server action (which wipes
// lesson progress and stamps the cycle cutoff) and refreshes.
export default function RenewalCta({ programId }: { programId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (
      !confirm(
        'Renewing means completing the ENTIRE course again — every module, in order, including quizzes. Your previous progress will be cleared for this certification. Start now?'
      )
    )
      return
    setBusy(true)
    setError(null)
    const res = await startCertRenewal(programId)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleStart}
        disabled={busy}
        className="rounded-full bg-burgundy px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? 'Starting…' : 'Start renewal'}
      </button>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}
