'use client'

import { useEffect, useRef } from 'react'

// Minimal native rich-text editor for cert lesson pages: bold, italic,
// headings, and lists via contentEditable + execCommand — no dependency.
// Emits raw HTML; the server action sanitizes before storing.

const BTN =
  'rounded px-2.5 py-1.5 text-xs font-semibold text-plum/70 hover:bg-plum/10 hover:text-plum transition-colors'

export default function RichTextEditor({
  initialHtml,
  onChange,
}: {
  initialHtml: string
  onChange: (html: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Seed the editable area once; afterwards the DOM owns the content
  // (re-setting innerHTML on each render would reset the caret).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) {
      ref.current.innerHTML = initialHtml
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function exec(command: string, value?: string) {
    ref.current?.focus()
    document.execCommand(command, false, value)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-plum/20 bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-plum/10 bg-plum/5 px-2 py-1.5">
        <button type="button" className={`${BTN} font-bold`} title="Bold" onClick={() => exec('bold')}>
          B
        </button>
        <button type="button" className={`${BTN} italic`} title="Italic" onClick={() => exec('italic')}>
          I
        </button>
        <span className="mx-1 h-4 w-px bg-plum/15" />
        <button type="button" className={BTN} title="Large heading" onClick={() => exec('formatBlock', '<h2>')}>
          H1
        </button>
        <button type="button" className={BTN} title="Small heading" onClick={() => exec('formatBlock', '<h3>')}>
          H2
        </button>
        <button type="button" className={BTN} title="Normal text" onClick={() => exec('formatBlock', '<p>')}>
          Text
        </button>
        <span className="mx-1 h-4 w-px bg-plum/15" />
        <button type="button" className={BTN} title="Bullet list" onClick={() => exec('insertUnorderedList')}>
          • List
        </button>
        <button type="button" className={BTN} title="Numbered list" onClick={() => exec('insertOrderedList')}>
          1. List
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => ref.current && onChange(ref.current.innerHTML)}
        className="min-h-40 px-4 py-3 text-sm leading-relaxed text-plum focus:outline-none [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-serif [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  )
}
