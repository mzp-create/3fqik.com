import { getDb, schema } from '../src/lib/db/index'
import { normalizePhone } from '../src/lib/auth/phone'
import { hashPin } from '../src/lib/auth/pin'

const [phone, pin, name] = process.argv.slice(2)
if (!phone || !pin || !name) {
  console.error('usage: npx tsx scripts/create-admin.ts <phone> <6-digit-pin> <name>')
  process.exit(1)
}
const db = getDb()
db.insert(schema.players).values({
  phone: normalizePhone(phone), pinHash: hashPin(pin),
  displayName: name, role: 'admin', createdAt: new Date().toISOString(),
}).run()
console.log('admin created')
