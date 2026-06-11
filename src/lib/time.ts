const MMT = 'Asia/Yangon'

function parseUtc(utcIso: string): Date {
  const d = new Date(utcIso)
  if (isNaN(d.getTime())) throw new TypeError(`Invalid ISO timestamp: ${utcIso}`)
  return d
}

export function matchDayOf(utcIso: string): string {
  const d = parseUtc(utcIso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MMT, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function formatMmt(utcIso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MMT, day: '2-digit', month: 'short', hour: '2-digit',
    minute: '2-digit', hour12: false,
  }).format(parseUtc(utcIso))
}

export function nowIso(): string {
  return new Date().toISOString()
}
