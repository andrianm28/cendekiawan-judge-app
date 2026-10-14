import { describe, expect, it } from 'vitest'
import { hashPin } from './auth'
import { makeHandler } from './handler'
import { ApiError, JudgingService } from './service'
import { memoryStore } from './store'

const SECRET = 'test-secret-test-secret-test-secret'
const FULL = { d1: 3, d2: 3, d3: 3, d4: 4, d5: 2, v1: 4, v2: 3, v3: 3, v4: 2 } as const

async function setup() {
  const store = memoryStore()
  await store.putAdminPinHash(hashPin('999999'))
  await store.putJudges([
    { id: 'g1', group: 1, name: 'Mba Yashinta', pinHash: hashPin('1111') },
    { id: 'g2', group: 2, name: 'Pak Kresna', pinHash: hashPin('2222') },
  ])
  let t = Date.parse('2026-10-20T02:00:00Z')
  const service = new JudgingService(store, SECRET, () => new Date((t += 1000)))
  return { store, service, handler: makeHandler(service, SECRET) }
}

const call = async (handler: ReturnType<typeof makeHandler>, method: string, path: string, body?: unknown, token?: string) => {
  const r = (await handler({
    requestContext: { http: { method } } as never,
    rawPath: path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  })) as { statusCode: number; body: string }
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null }
}

describe('login', () => {
  it('maps a PIN to its judge or the admin, and rejects others', async () => {
    const { handler } = await setup()
    const j = await call(handler, 'POST', '/login', { pin: '2222' })
    expect(j.status).toBe(200)
    expect(j.body.judge).toEqual({ id: 'g2', group: 2, name: 'Pak Kresna' })
    expect((await call(handler, 'POST', '/login', { pin: '999999' })).body.role).toBe('admin')
    expect((await call(handler, 'POST', '/login', { pin: '0000' })).status).toBe(401)
  })

  it('rejects requests without a valid token', async () => {
    const { handler } = await setup()
    expect((await call(handler, 'GET', '/state')).status).toBe(401)
    expect((await call(handler, 'GET', '/state', undefined, 'forged.token')).status).toBe(401)
  })
})

describe('saving scores', () => {
  it('saves a judge sheet and returns only their own sheets', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const g2 = (await call(handler, 'POST', '/login', { pin: '2222' })).body.token
    expect((await call(handler, 'PUT', '/scores/t03', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)).status).toBe(200)
    expect((await call(handler, 'PUT', '/scores/t05', { sheet: { d1: 2 }, note: '', status: 'draft', version: 1 }, g2)).status).toBe(200)
    const s1 = await call(handler, 'GET', '/state', undefined, g1)
    expect(s1.body.scores.map((s: { teamId: string }) => s.teamId)).toEqual(['t03'])
    expect(s1.body.presence).toBeUndefined()
  })

  it('refuses another group, invalid levels, and incomplete submissions', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    expect((await call(handler, 'PUT', '/scores/t05', { sheet: {}, note: '', status: 'draft', version: 1 }, g1)).status).toBe(403)
    expect((await call(handler, 'PUT', '/scores/t01', { sheet: { d1: 5 }, note: '', status: 'draft', version: 1 }, g1)).status).toBe(400)
    expect((await call(handler, 'PUT', '/scores/t01', { sheet: { d1: 3 }, note: '', status: 'submitted', version: 1 }, g1)).body.code).toBe('incomplete')
  })

  it('ignores an older version arriving late and returns the saved one', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    await call(handler, 'PUT', '/scores/t01', { sheet: { d1: 4 }, note: '', status: 'draft', version: 5 }, g1)
    const late = await call(handler, 'PUT', '/scores/t01', { sheet: { d1: 1 }, note: '', status: 'draft', version: 3 }, g1)
    expect(late.status).toBe(409)
    expect(late.body.current.sheet).toEqual({ d1: 4 })
  })

  it('locks a closed group for judges; the operator corrects with a logged reason', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)
    expect((await call(handler, 'POST', '/admin/groups/1', { closed: true }, g1)).status).toBe(403)
    expect((await call(handler, 'POST', '/admin/groups/1', { closed: true }, admin)).body.closedGroups).toEqual([1])
    expect((await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: 'x', status: 'submitted', version: 2 }, g1)).status).toBe(423)

    expect((await call(handler, 'PUT', '/admin/scores/g1/t01', { sheet: { ...FULL, d5: 3 }, note: '', status: 'submitted', reason: '' }, admin)).status).toBe(400)
    const fixed = await call(handler, 'PUT', '/admin/scores/g1/t01', { sheet: { ...FULL, d5: 3 }, note: '', status: 'submitted', reason: 'Judge asked to fix D5' }, admin)
    expect(fixed.body.version).toBe(2)
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body
    expect(audit.map((a: { action: string }) => a.action)).toEqual(['close_group', 'correct_score'])
    expect(audit[1].detail.reason).toBe('Judge asked to fix D5')
  })
})

describe('admin', () => {
  it('renames a judge and refuses deliberation changes after lock', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    expect((await call(handler, 'PUT', '/admin/judges/g2', { name: 'Dr. Example' }, admin)).body.name).toBe('Dr. Example')
    const d = { order: ['t17'], log: [{ at: 'x', teamId: 't17', from: 2, to: 1, reason: 'demo' }], lockedAt: null }
    expect((await call(handler, 'PUT', '/admin/deliberation', d, admin)).status).toBe(200)
    expect((await call(handler, 'PUT', '/admin/deliberation', { ...d, lockedAt: 'now' }, admin)).status).toBe(200)
    expect((await call(handler, 'PUT', '/admin/deliberation', d, admin)).status).toBe(423)
    const state = (await call(handler, 'GET', '/state', undefined, admin)).body
    expect(state.deliberation.lockedAt).toBe('now')
    expect(state.judges.find((j: { id: string }) => j.id === 'g2')).toEqual({ id: 'g2', group: 2, name: 'Dr. Example' })
    expect(JSON.stringify(state)).not.toContain('pinHash')
  })

  it('throws typed errors from the service', async () => {
    const { service } = await setup()
    await expect(service.login('abc')).rejects.toBeInstanceOf(ApiError)
  })
})
