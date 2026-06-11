import { getDb, schema } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/session'
import { resetPin, unlockPlayer, grantAdmin } from '@/lib/auth/adminActions'
import { ok, fail, handle } from '@/lib/api'
import { nowIso } from '@/lib/time'

export async function GET() {
  return handle(async () => {
    await requireAdmin()
    const rows = getDb().select().from(schema.players).all()
    return ok(rows.map(({ pinHash: _ph, ...rest }) => rest))
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin()
    const body = await req.json()
    const { action, playerId, tempPin } = body
    if (typeof action !== 'string' || typeof playerId !== 'number')
      return fail('bad_request', 'action must be a string and playerId must be a number')
    const db = getDb()
    if (action === 'reset_pin') {
      if (typeof tempPin !== 'string')
        return fail('bad_request', 'tempPin must be a string')
      resetPin(db, admin.id, playerId, tempPin, nowIso())
    } else if (action === 'unlock') {
      unlockPlayer(db, admin.id, playerId, nowIso())
    } else if (action === 'grant_admin') {
      grantAdmin(db, admin.id, playerId, nowIso())
    } else {
      return fail('bad_action', 'unknown action')
    }
    return ok({})
  })
}
