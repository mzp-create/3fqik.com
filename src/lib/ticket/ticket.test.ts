import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { newTicketNo } from './ticketNo'
import { signTicket, verifyTicketSig, ticketUrl } from './sign'

// NOTE: The plan specifies only beforeEach here (no afterEach), but we follow
// the session.test.ts pattern of saving/restoring env in afterEach to avoid
// cross-suite pollution. This is an intentional deviation from the plan's
// verbatim test content.
let originalTicketSecrets: string | undefined
let originalAppOrigin: string | undefined

beforeEach(() => {
  originalTicketSecrets = process.env.TICKET_SECRETS
  originalAppOrigin = process.env.APP_ORIGIN
  process.env.TICKET_SECRETS = 'secret-v1,secret-v2'
  process.env.APP_ORIGIN = 'https://bet.example.com'
})

afterEach(() => {
  if (originalTicketSecrets === undefined) {
    delete process.env.TICKET_SECRETS
  } else {
    process.env.TICKET_SECRETS = originalTicketSecrets
  }
  if (originalAppOrigin === undefined) {
    delete process.env.APP_ORIGIN
  } else {
    process.env.APP_ORIGIN = originalAppOrigin
  }
})

it('generates WB-XXXXX with unambiguous alphabet', () => {
  for (let k = 0; k < 50; k++) expect(newTicketNo()).toMatch(/^WB-[2-9A-HJ-NP-Z]{5}$/)
})

it('signs with newest key, verifies any listed version, rejects tampering', () => {
  const { v, sig } = signTicket('WB-7K3F9')
  expect(v).toBe(2)
  expect(verifyTicketSig('WB-7K3F9', v, sig)).toBe(true)
  expect(verifyTicketSig('WB-7K3F9', 1, signTicket('WB-7K3F9', 1).sig)).toBe(true) // old keys stay valid
  expect(verifyTicketSig('WB-7K3F8', v, sig)).toBe(false)
  expect(verifyTicketSig('WB-7K3F9', v, sig.slice(0, -2) + 'aa')).toBe(false)
  expect(verifyTicketSig('WB-7K3F9', 9, sig)).toBe(false) // unknown version
})

it('builds the verification URL', () => {
  const { v, sig } = signTicket('WB-7K3F9')
  expect(ticketUrl('WB-7K3F9')).toBe(`https://bet.example.com/t/WB-7K3F9?v=${v}&sig=${sig}`)
})
