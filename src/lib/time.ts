const MMT = 'Asia/Yangon'

export function matchDayOf(utcIso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MMT, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(utcIso)) // en-CA gives YYYY-MM-DD
}

export function formatMmt(utcIso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MMT, day: '2-digit', month: 'short', hour: '2-digit',
    minute: '2-digit', hour12: false,
  }).format(new Date(utcIso))
}

export function nowIso(): string {
  return new Date().toISOString()
}
