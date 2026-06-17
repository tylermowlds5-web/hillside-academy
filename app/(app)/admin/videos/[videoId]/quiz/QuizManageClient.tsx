'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Quiz } from '@/lib/types'
import type { QuizPayload } from '@/app/actions'
import QuizBuilder from './QuizBuilder'
import ConfirmCloseDialog from '../../../ConfirmCloseDialog'

// Client wrapper for the video quiz builder page. The page has no overlay to
// click, so "close" here is the back navigation — guarded with the same
// unsaved-changes confirmation as the standalone quiz modals. A beforeunload
// handler covers hard navigations (refresh / tab close) while dirty.

export default function QuizManageClient({
  backHref,
  existing,
  onSave,
  children,
}: {
  backHref: string
  existing: Pick<Quiz, 'passing_score' | 'questions'> | null
  onSave: (payload: QuizPayload) => Promise<void>
  // Server-rendered header (title, attempt count, delete) shown above the
  // builder, between the back link and the builder itself.
  children: React.ReactNode
}) {
  const router = useRouter()
  const [dirty, setDirty] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function requestBack() {
    if (dirty) setConfirmingClose(true)
    else router.push(backHref)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        type="button"
        onClick={requestBack}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Videos
      </button>

      {children}

      <QuizBuilder existing={existing} onSave={onSave} onDirtyChange={setDirty} />

      {confirmingClose && (
        <ConfirmCloseDialog
          onCancel={() => setConfirmingClose(false)}
          onConfirm={() => router.push(backHref)}
        />
      )}
    </div>
  )
}
