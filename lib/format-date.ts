const TZ = 'America/Los_Angeles'
const LOCALE = 'en-US'

// Every timestamp the backend stores is UTC. But a datetime string that arrives
// WITHOUT a timezone marker (e.g. "2026-06-24T21:33:00", no trailing Z or
// +00:00 offset) is parsed by `new Date()` as *local* time — so the LA-zoned
// output would be 7–8 hours off (showing 09:33 PM instead of 02:33 PM). Force
// such strings to UTC by appending "Z" so the conversion to Pacific is correct.
// Date-only strings ("2026-06-24") have no time component and are left alone.
function toDate(iso: string): Date {
  const hasTime = /\d{2}:\d{2}/.test(iso)
  const hasZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTime && !hasZone ? `${iso}Z` : iso)
}

/** "4/16/2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  // A date-only value ("2026-06-24", e.g. a due date) is a literal calendar
  // date, not an instant. Render it in UTC so converting to Pacific doesn't
  // pull it back to the previous evening (which would show 6/23 for 6/24).
  const dateOnly = !/\d{2}:\d{2}/.test(iso)
  return toDate(iso).toLocaleDateString(LOCALE, { timeZone: dateOnly ? 'UTC' : TZ })
}

/** "02:35 PM" */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return toDate(iso).toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "4/16/2026, 02:35 PM" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return toDate(iso).toLocaleString(LOCALE, { timeZone: TZ })
}
