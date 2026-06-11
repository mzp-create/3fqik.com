import { createHmac, timingSafeEqual } from 'node:crypto'

function secrets(): string[] {
  const raw = process.env.TICKET_SECRETS
  if (!raw) throw new Error('TICKET_SECRETS not set')
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function hmac(secret: string, ticketNo: string): string {
  return createHmac('sha256', secret).update(ticketNo).digest('base64url').slice(0, 22) // 16 bytes ≈ 22 chars
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
  const list = secrets()
  const secret = list[v - 1]
  if (!secret) return false
  const expected = hmac(secret, ticketNo)
  const a = Buffer.from(expected); const b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function ticketUrl(ticketNo: string): string {
  const { v, sig } = signTicket(ticketNo)
  return `${process.env.APP_ORIGIN}/t/${ticketNo}?v=${v}&sig=${sig}`
}
