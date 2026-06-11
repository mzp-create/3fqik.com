/** Normalize Myanmar mobile numbers to canonical 09xxxxxxxxx form. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s\-+]/g, '')
  let rest: string
  if (digits.startsWith('959')) rest = digits.slice(3)
  else if (digits.startsWith('09')) rest = digits.slice(2)
  else if (digits.startsWith('9')) rest = digits.slice(1)
  else throw new Error('invalid phone')
  if (!/^\d{7,10}$/.test(rest)) throw new Error('invalid phone')
  return '09' + rest
}
