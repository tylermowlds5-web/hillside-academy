import type { ReactNode } from 'react'

// Shared by PlantPage and PageBlocks: **bold** → <strong>; no other markup.
// React escapes everything else, so stray HTML in the data renders as
// literal text.

export const has = (s: string | undefined | null): s is string => !!s && s.trim() !== ''

export function renderBold(text: string, strongClass = 'font-semibold text-plum'): ReactNode[] {
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
