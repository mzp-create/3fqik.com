import { getDb } from '@/lib/db'
import { registerPlayer } from '@/lib/auth/flows'
import { setSessionCookie } from '@/lib/auth/session'
import { ok, handle } from '@/lib/api'
import { nowIso } from '@/lib/time'

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json()
    const p = registerPlayer(getDb(), body, nowIso())
    await setSessionCookie({ playerId: p.id, role: p.role, epoch: p.sessionEpoch })
    return ok({ id: p.id, name: p.displayName, role: p.role, language: p.language })
  })
}
