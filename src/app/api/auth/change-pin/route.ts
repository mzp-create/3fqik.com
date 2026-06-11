import { getDb } from '@/lib/db'
import { changePin } from '@/lib/auth/flows'
import { requirePlayer, setSessionCookie } from '@/lib/auth/session'
import { ok, handle } from '@/lib/api'

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer()
    const { currentPin, newPin } = await req.json()
    changePin(getDb(), me.id, currentPin, newPin)
    await setSessionCookie({ playerId: me.id, role: me.role, epoch: me.sessionEpoch + 1 })
    return ok({})
  })
}
