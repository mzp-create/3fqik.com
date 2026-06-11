import { getDb } from '@/lib/db'
import { loginPlayer } from '@/lib/auth/flows'
import { setSessionCookie } from '@/lib/auth/session'
import { ok, handle } from '@/lib/api'
import { nowIso } from '@/lib/time'

export async function POST(req: Request) {
  return handle(async () => {
    const { phone, pin } = await req.json()
    const { player } = loginPlayer(getDb(), phone, pin, nowIso())
    await setSessionCookie({ playerId: player.id, role: player.role, epoch: player.sessionEpoch })
    return ok({ id: player.id, name: player.displayName, role: player.role,
      language: player.language, mustChangePin: player.mustChangePin })
  })
}
