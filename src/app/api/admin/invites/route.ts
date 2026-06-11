import { getDb, schema } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/session'
import { createInvite } from '@/lib/auth/adminActions'
import { ok, handle } from '@/lib/api'

export async function GET() {
  return handle(async () => {
    await requireAdmin()
    return ok(getDb().select().from(schema.inviteCodes).all())
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin()
    const { maxUses, expiresAt } = await req.json()
    return ok(createInvite(getDb(), admin.id, { maxUses, expiresAt }))
  })
}
