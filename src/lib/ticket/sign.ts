import { createHmac, timingSafeEqual } from 'node:crypto'

function secrets(): string[] {
  const raw = process.env.TICKET_SECRETS
  if (!raw) throw new Error('TICKET_SECRETS not set')
  // NOTE: never remove a secret from the list — replace in-slot with a dummy. Removing shifts version numbers and breaks all outstanding QR codes.
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (list.length === 0) throw new Error('TICKET_SECRETS not set')
  return list
}

function hmac(secret: string, ticketNo: string): string {
  return createHmac('sha256', secret).update(ticketNo).digest('base64url').slice(0, 22) // 22 base64url chars = 132 bits
}

/** Sign with the given key version (1-based) or the newest. */
export function signTicket(ticketNo: string, version?: number): { v: number; sig: string } {
  const list = secrets()
  const v = version ?? list.length
  const secret = list[v - 1]
  if (!secret) throw new Error('unknown ticket secret version')
  return { v, sig: hmac(secret, ticketNo) }
}

export function verifyTicketSig(ticketNo: string, v: number, sig: string): boolean {
  if (!Number.isInteger(v) || v < 1) return false
  const list = secrets()
  const secret = list[v - 1]
  if (!secret) return false
  const expected = hmac(secret, ticketNo)
  const a = Buffer.from(expected); const b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function ticketUrl(ticketNo: string): string {
  const origin = process.env.APP_ORIGIN
  if (!origin) throw new Error('APP_ORIGIN not set')
  const { v, sig } = signTicket(ticketNo)
  return `${origin}/t/${ticketNo}?v=${v}&sig=${sig}`
}
