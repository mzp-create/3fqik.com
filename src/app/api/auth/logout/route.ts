import { clearSessionCookie } from '@/lib/auth/session'
import { ok } from '@/lib/api'

export async function POST() {
  await clearSessionCookie()
  return ok({})
}
