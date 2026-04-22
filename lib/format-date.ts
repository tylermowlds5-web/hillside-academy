const TZ = 'America/Los_Angeles'
const LOCALE = 'en-US'

/** "4/16/2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(LOCALE, { timeZone: TZ })
}

/** "02:35 PM" */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "4/16/2026, 02:35 PM" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(LOCALE, { timeZone: TZ })
}
