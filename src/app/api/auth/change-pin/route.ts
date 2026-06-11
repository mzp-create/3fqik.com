import { getDb } from '@/lib/db'
import { changePin } from '@/lib/auth/flows'
import { requirePlayer, setSessionCookie } from '@/lib/auth/session'
import { ok, handle } from '@/lib/api'

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer({ allowMustChangePin: true })
    const { currentPin, newPin } = await req.json()
    const updated = changePin(getDb(), me.id, currentPin, newPin)
    await setSessionCookie({ playerId: updated.id, role: updated.role, epoch: updated.sessionEpoch })
    return ok({})
  })
}
