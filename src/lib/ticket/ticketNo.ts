import { randomBytes } from 'node:crypto'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function newTicketNo(): string {
  const bytes = randomBytes(5)
  let s = ''
  for (let k = 0; k < 5; k++) s += ALPHABET[bytes[k] % ALPHABET.length]
  return `WB-${s}`
}
