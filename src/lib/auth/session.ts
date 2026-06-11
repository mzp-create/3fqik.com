import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'

export type Session = { playerId: number; role: 'player' | 'admin'; epoch: number }
const COOKIE = 'wb_session'
const THIRTY_DAYS = 60 * 60 * 24 * 30

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET!)
}

export async function createSessionToken(s: Session): Promise<string> {
  return new SignJWT(s as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${THIRTY_DAYS}s`)
    .sign(secret())
}

export async function verifySessionToken(tok: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(tok, secret())
    return { playerId: payload.playerId as number, role: payload.role as Session['role'], epoch: payload.epoch as number }
  } catch {
    return null
  }
}

export async function setSessionCookie(s: Session) {
  ;(await cookies()).set(COOKIE, await createSessionToken(s), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: THIRTY_DAYS, path: '/',
  })
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(COOKIE)
}

/** Returns the player row or null. Epoch mismatch (PIN reset) = invalid. */
export async function currentPlayer() {
  const tok = (await cookies()).get(COOKIE)?.value
  if (!tok) return null
  const s = await verifySessionToken(tok)
  if (!s) return null
  const db = getDb()
  const p = db.select().from(schema.players).where(eq(schema.players.id, s.playerId)).get()
  if (!p || p.sessionEpoch !== s.epoch) return null
  return p
}

export async function requirePlayer() {
  const p = await currentPlayer()
  if (!p) throw Object.assign(new Error('unauthorized'), { httpStatus: 401 })
  return p
}

export async function requireAdmin() {
  const p = await requirePlayer()
  if (p.role !== 'admin') throw Object.assign(new Error('forbidden'), { httpStatus: 403 })
  return p
}
