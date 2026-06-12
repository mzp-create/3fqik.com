/**
 * Normalize Myanmar mobile numbers to canonical 09xxxxxxxxx form.
 * Accepted forms: 09…, +959…, 959… (spaces/dashes anywhere; '+' only as first char).
 * Note: bare '959…' is treated as country-code form; this is the common typed form
 * here. Bare '9…' (without 0 or 95) is rejected as ambiguous.
 */
export function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s\-]/g, '')
  const m = /^(?:\+?959|09)(\d{7,10})$/.exec(s)
  if (!m) throw new Error('invalid phone')
  return '09' + m[1]
}
