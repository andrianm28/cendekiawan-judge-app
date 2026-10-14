// Writes judge accounts and the operator PIN into the DynamoDB table.
//
//   TABLE_NAME=cendekiawan-judge npm run seed
//
// PINs come from JUDGE_PINS ("g1=1234,g2=5678,...") and ADMIN_PIN; any that are
// missing are generated and printed once. Only salted hashes are stored.
// Re-running keeps judge names already changed by the operator.

import { randomInt } from 'node:crypto'
import { JUDGES } from '../../web/src/judges'
import { hashPin } from '../src/auth'
import { dynamoStore } from '../src/dynamoStore'

const table = process.env.TABLE_NAME
if (!table) throw new Error('Set TABLE_NAME')

const given = Object.fromEntries(
  (process.env.JUDGE_PINS ?? '').split(',').filter(Boolean).map((p) => p.split('=').map((s) => s.trim())),
)
const pin = (len: number) => String(randomInt(10 ** (len - 1), 10 ** len))
const pins: Record<string, string> = {}
for (const j of JUDGES) pins[j.id] = given[j.id] ?? pin(6)
const adminPin = process.env.ADMIN_PIN ?? pin(8)
if (new Set(Object.values(pins)).size < JUDGES.length || Object.values(pins).includes(adminPin)) {
  throw new Error('PINs must be unique; run again')
}

const store = dynamoStore(table)
const existing = new Map((await store.getJudges()).map((j) => [j.id, j.name]))
await store.putJudges(JUDGES.map((j) => ({ ...j, name: existing.get(j.id) ?? j.name, pinHash: hashPin(pins[j.id]) })))
await store.putAdminPinHash(hashPin(adminPin))

console.log('PINs (hand these out; they are not stored in plain text):')
for (const j of JUDGES) console.log(`  Group ${j.group}  ${existing.get(j.id) ?? j.name}: ${pins[j.id]}`)
console.log(`  Operator: ${adminPin}`)
