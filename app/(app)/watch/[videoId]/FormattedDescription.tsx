import { Fragment, type ReactNode } from 'react'

// Renders the lightweight markdown our AI-generated descriptions use — **bold**,
// bullet lists (-, *, •), numbered lists, and paragraphs/line breaks. Built by
// hand (no dangerouslySetInnerHTML) so there's no XSS surface and no dependency.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let i = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(
      <strong key={`${keyPrefix}-b${i++}`} className="font-semibold text-zinc-200">
        {match[1]}
      </strong>
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

const isBullet = (s: string) => /^[-*•]\s+/.test(s)
const isNumbered = (s: string) => /^\d+[.)]\s+/.test(s)

export default function FormattedDescription({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (trimmed === '') {
      i++
      continue
    }

    if (isBullet(trimmed)) {
      const items: string[] = []
      while (i < lines.length && isBullet(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''))
        i++
      }
      const k = key++
      blocks.push(
        <ul key={k} className="list-disc pl-5 space-y-1 my-2">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ul${k}-${idx}`)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (isNumbered(trimmed)) {
      const items: string[] = []
      while (i < lines.length && isNumbered(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      const k = key++
      blocks.push(
        <ol key={k} className="list-decimal pl-5 space-y-1 my-2">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ol${k}-${idx}`)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Paragraph — gather consecutive non-blank, non-list lines.
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isBullet(lines[i].trim()) &&
      !isNumbered(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim())
      i++
    }
    const k = key++
    blocks.push(
      <p key={k} className="my-2">
        {paraLines.map((pl, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(pl, `p${k}-${idx}`)}
          </Fragment>
        ))}
      </p>
    )
  }

  return <div className={className}>{blocks}</div>
}
