import { getDb, schema } from '../src/lib/db/index'
import { normalizePhone } from '../src/lib/auth/phone'
import { hashPin } from '../src/lib/auth/pin'
import { nowIso } from '../src/lib/time'

const [phone, pin, name] = process.argv.slice(2)
if (!phone || !pin || !name || !/^\d{6}$/.test(pin)) {
  console.error('usage: npx tsx scripts/create-admin.ts <phone> <6-digit-pin> <name>')
  process.exit(1)
}
const db = getDb()
try {
  db.insert(schema.players).values({
    phone: normalizePhone(phone), pinHash: hashPin(pin),
    displayName: name, role: 'admin', createdAt: nowIso(),
  }).run()
  console.log('admin created')
} catch (e: unknown) {
  if ((e as { code?: string })?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    console.error('error: a player with that phone number already exists')
    process.exit(1)
  }
  if (e instanceof Error && e.message === 'invalid phone') {
    console.error('error: invalid phone number')
    process.exit(1)
  }
  throw e
}
