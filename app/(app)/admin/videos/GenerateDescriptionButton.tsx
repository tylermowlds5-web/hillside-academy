'use client'

import type { GenState } from './useGenerateDescription'

// Shared "Generate Description with AI" button + status/error text, used by both
// the upload and edit forms so they look and behave identically.
export default function GenerateDescriptionButton({
  genState,
  genError,
  disabled,
  onClick,
}: {
  genState: GenState
  genError: string | null
  disabled?: boolean
  onClick: () => void
}) {
  const working = genState === 'transcribing' || genState === 'generating'

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || working}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {working ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
          </svg>
        )}
        {genState === 'transcribing'
          ? 'Transcribing video…'
          : genState === 'generating'
          ? 'Generating description…'
          : 'Generate Description with AI'}
      </button>
      {working && (
        <p className="text-xs text-zinc-500 mt-1 w-full">
          {genState === 'transcribing'
            ? 'Transcribing the video audio — this can take a minute…'
            : 'Writing a description from the transcript…'}
        </p>
      )}
      {genError && <p className="text-xs text-red-400 mt-1 break-words w-full">{genError}</p>}
    </>
  )
}
