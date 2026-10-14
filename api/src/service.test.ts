import { describe, expect, it } from 'vitest'
import { hashPin } from './auth'
import { makeHandler } from './handler'
import { ApiError, JudgingService } from './service'
import { memoryStore } from './store'
import { CATEGORIES, TEAMS } from '../../web/src/domain/teams'

const SECRET = 'test-secret-test-secret-test-secret'
const FULL = { d1: 3, d2: 3, d3: 3, d4: 4, d5: 2, v1: 4, v2: 3, v3: 3, v4: 2 } as const
const PLAIN = { d1: 2, d2: 2, d3: 2, d4: 2, d5: 2, v1: 2, v2: 2, v3: 2, v4: 2 } as const

/**
 * Both judges submit every team: the first team of each category gets FULL, the rest
 * PLAIN unless `overrides` says otherwise. Returns the category winners' ids.
 */
async function scoreEveryTeam(handler: ReturnType<typeof makeHandler>, overrides: Record<string, object> = {}) {
  const tokens = [(await call(handler, 'POST', '/login', { pin: '1111' })).body.token, (await call(handler, 'POST', '/login', { pin: '2222' })).body.token]
  const firsts = CATEGORIES.map((c) => TEAMS.find((t) => t.category === c.id)!.id)
  for (const t of TEAMS) {
    const sheet = overrides[t.id] ?? (firsts.includes(t.id) ? FULL : PLAIN)
    for (const tok of tokens) await call(handler, 'PUT', `/scores/${t.id}`, { sheet, note: '', status: 'submitted', version: 1 }, tok)
  }
  return firsts
}

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
    expect(j.body.judge).toEqual({ id: 'g2', group: 2, name: 'Pak Kresna', title: '' })
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

  it('lets a judge score any team, and refuses invalid levels and incomplete submissions', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    expect((await call(handler, 'PUT', '/scores/t05', { sheet: {}, note: '', status: 'draft', version: 1 }, g1)).status).toBe(200)
    expect((await call(handler, 'PUT', '/scores/t99', { sheet: {}, note: '', status: 'draft', version: 1 }, g1)).status).toBe(404)
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

  it('locks a closed category for every judge; the operator corrects with a logged reason', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)
    expect((await call(handler, 'POST', '/admin/groups/1', { closed: true }, g1)).status).toBe(403)
    expect((await call(handler, 'POST', '/admin/groups/1', { closed: true }, admin)).body.closedGroups).toEqual([1])
    expect((await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: 'x', status: 'submitted', version: 2 }, g1)).status).toBe(423)
    const g2 = (await call(handler, 'POST', '/login', { pin: '2222' })).body.token
    expect((await call(handler, 'PUT', '/scores/t02', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g2)).status).toBe(423)
    expect((await call(handler, 'PUT', '/scores/t05', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g2)).status).toBe(200)

    expect((await call(handler, 'PUT', '/admin/scores/g1/t01', { sheet: { ...FULL, d5: 3 }, note: '', status: 'submitted', reason: '' }, admin)).status).toBe(400)
    const fixed = await call(handler, 'PUT', '/admin/scores/g1/t01', { sheet: { ...FULL, d5: 3 }, note: '', status: 'submitted', reason: 'Judge asked to fix D5' }, admin)
    expect(fixed.body.version).toBe(2)
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body
    expect(audit.map((a: { action: string }) => a.action)).toEqual(['close_group', 'correct_score'])
    expect(audit[1].detail.reason).toBe('Judge asked to fix D5')
  })

  it('freezes every score once the result is locked, for judges and the operator', async () => {
    const { handler, store } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)
    await store.putDeliberation({ order: [], log: [], lockedAt: 'now' })
    expect((await call(handler, 'PUT', '/scores/t01', { sheet: { ...FULL, d1: 1 }, note: '', status: 'submitted', version: 2 }, g1)).status).toBe(423)
    expect((await call(handler, 'PUT', '/scores/t09', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)).status).toBe(423)
    expect((await call(handler, 'PUT', '/admin/scores/g1/t01', { sheet: { ...FULL, d1: 1 }, note: '', status: 'submitted', reason: 'late' }, admin)).status).toBe(423)
    const state = (await call(handler, 'GET', '/state', undefined, admin)).body
    expect(state.scores[0].sheet).toEqual(FULL)
    expect((await call(handler, 'GET', '/state', undefined, g1)).body.locked).toBe(true)
  })
})

describe('running order and pitch timer', () => {
  it('lets only the operator set the order, the team on stage and the timer; judges see it', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    expect((await call(handler, 'PUT', '/admin/runorder', { current: 't01' }, g1)).status).toBe(403)

    const set = await call(handler, 'PUT', '/admin/runorder', { order: ['t05', 't01'], current: 't05', timer: 'start' }, admin)
    expect(set.body.order.slice(0, 3)).toEqual(['t05', 't01', 't02'])
    expect(set.body.startedAt).toBeTruthy()
    const seen = (await call(handler, 'GET', '/state', undefined, g1)).body
    expect(seen.runOrder).toEqual(set.body)
    expect(seen.serverTime).toBeTruthy()

    // Moving to the next team clears the timer until the operator starts it again.
    const next = await call(handler, 'PUT', '/admin/runorder', { current: 't01' }, admin)
    expect(next.body.startedAt).toBeNull()
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body
    expect(audit.map((a: { action: string }) => a.action)).toEqual(['set_order', 'now_presenting', 'start_timer', 'now_presenting'])
  })
})

describe('ties', () => {
  const LOW = { d1: 2, d2: 2, d3: 2, d4: 2, d5: 2, v1: 2, v2: 2, v3: 2, v4: 2 }
  const EQ = { ...FULL, d1: 4, d4: 3 } // same final as FULL, different D1
  async function tiedEducation() {
    const ctx = await setup()
    const g1 = (await call(ctx.handler, 'POST', '/login', { pin: '1111' })).body.token
    const g2 = (await call(ctx.handler, 'POST', '/login', { pin: '2222' })).body.token
    const admin = (await call(ctx.handler, 'POST', '/login', { pin: '999999' })).body.token
    const put = (tok: string, team: string, sheet: object) =>
      call(ctx.handler, 'PUT', `/scores/${team}`, { sheet, note: '', status: 'submitted', version: 1 }, tok)
    for (const tok of [g1, g2]) {
      await put(tok, 't01', FULL)
      await put(tok, 't02', EQ)
      await put(tok, 't03', LOW)
    }
    return { ...ctx, g1, g2, admin, put }
  }

  it('offers the tie only after every judge scored the category, and only to its owner', async () => {
    const { handler, g1, g2, put } = await tiedEducation()
    expect((await call(handler, 'GET', '/state', undefined, g1)).body.ties).toEqual([])
    expect((await call(handler, 'PUT', '/ties/education', { teamId: 't01' }, g1)).status).toBe(409)
    await put(g1, 't04', LOW)
    await put(g2, 't04', LOW)

    const s1 = (await call(handler, 'GET', '/state', undefined, g1)).body
    expect(s1.ties.map((t: { tied: { teamId: string }[] }) => t.tied.map((x) => x.teamId))).toEqual([['t02', 't01']])
    expect((await call(handler, 'GET', '/state', undefined, g2)).body.ties).toEqual([])

    expect((await call(handler, 'PUT', '/ties/education', { teamId: 't01' }, g2)).status).toBe(403)
    expect((await call(handler, 'PUT', '/ties/education', { teamId: 't03' }, g1)).status).toBe(400)
    expect((await call(handler, 'PUT', '/ties/education', { teamId: 't01' }, g1)).body.by).toBe('g1')
    expect((await call(handler, 'GET', '/state', undefined, g1)).body.ties[0].pick).toBe('t01')
  })

  it('lets the operator record the pick, and refuses after the result is locked', async () => {
    const { handler, store, g1, g2, admin, put } = await tiedEducation()
    await put(g1, 't04', LOW)
    await put(g2, 't04', LOW)
    expect((await call(handler, 'PUT', '/ties/education', { teamId: 't02' }, admin)).body.by).toBe('admin')
    await store.putDeliberation({ order: [], log: [], lockedAt: 'now' })
    expect((await call(handler, 'PUT', '/ties/education', { teamId: 't01' }, g1)).status).toBe(423)
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body
    expect(audit.find((a: { action: string }) => a.action === 'tie_pick').actor).toBe('admin')
  })
})

describe('reset after a rehearsal', () => {
  it('wipes event data for the operator only, keeps judges and PINs, and changes the epoch', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)
    await call(handler, 'POST', '/admin/groups/1', { closed: true }, admin)
    await call(handler, 'PUT', '/admin/runorder', { current: 't01', timer: 'start' }, admin)
    await call(handler, 'PUT', '/admin/judges/g2', { name: 'Dr. Example' }, admin)
    const before = (await call(handler, 'GET', '/state', undefined, admin)).body.epoch

    expect((await call(handler, 'POST', '/admin/reset', { confirm: 'RESET' }, g1)).status).toBe(403)
    expect((await call(handler, 'POST', '/admin/reset', { confirm: 'yes' }, admin)).status).toBe(400)
    const r = await call(handler, 'POST', '/admin/reset', { confirm: 'RESET' }, admin)
    expect(r.body.scores).toBe(1)

    const s = (await call(handler, 'GET', '/state', undefined, admin)).body
    expect(s.epoch).not.toBe(before)
    expect(s.scores).toEqual([])
    expect(s.closedGroups).toEqual([])
    expect(s.runOrder.current).toBeNull()
    expect(s.judges.find((j: { id: string }) => j.id === 'g2').name).toBe('Dr. Example')
    expect((await call(handler, 'GET', '/admin/audit', undefined, admin)).body.map((a: { action: string }) => a.action)).toEqual(['reset'])
    // The same PIN and the old session both still work.
    expect((await call(handler, 'POST', '/login', { pin: '1111' })).status).toBe(200)
    expect((await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)).status).toBe(200)
  })
})

describe('editing judges', () => {
  it('sets name, title, category (swapping owners) and a new unique PIN', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    expect((await call(handler, 'PUT', '/admin/judges/g1', { name: 'X' }, g1)).status).toBe(403)

    const r = await call(handler, 'PUT', '/admin/judges/g1', { name: 'Dr. Aisyah', title: 'Dean, UM', group: 2, pin: '424242' }, admin)
    expect(r.body).toEqual({ id: 'g1', group: 2, name: 'Dr. Aisyah', title: 'Dean, UM' })
    const judges = (await call(handler, 'GET', '/state', undefined, admin)).body.judges
    expect(judges.find((j: { id: string }) => j.id === 'g2').group).toBe(1)

    expect((await call(handler, 'POST', '/login', { pin: '1111' })).status).toBe(401)
    expect((await call(handler, 'POST', '/login', { pin: '424242' })).body.judge.name).toBe('Dr. Aisyah')

    expect((await call(handler, 'PUT', '/admin/judges/g2', { pin: '424242' }, admin)).body.code).toBe('pin_taken')
    expect((await call(handler, 'PUT', '/admin/judges/g2', { pin: '999999' }, admin)).body.code).toBe('pin_taken')
    expect((await call(handler, 'PUT', '/admin/judges/g2', { pin: '12' }, admin)).body.code).toBe('bad_pin')
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body
    expect(JSON.stringify(audit)).not.toContain('424242')
    expect(audit[0].detail).toMatchObject({ pinChanged: true, fromGroup: 1, toGroup: 2, swappedWith: 'g2' })
  })
})

describe('admin', () => {
  it('renames a judge and refuses deliberation changes after lock', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    expect((await call(handler, 'PUT', '/admin/judges/g2', { name: 'Dr. Example', title: 'Head of Cloud, AWS' }, admin)).body.title).toBe('Head of Cloud, AWS')
    const winners = await scoreEveryTeam(handler)
    const d = { order: winners, log: [{ at: 'x', teamId: winners[0], from: 2, to: 1, reason: 'demo' }], lockedAt: null }
    expect((await call(handler, 'PUT', '/admin/deliberation', d, admin)).status).toBe(200)
    expect((await call(handler, 'PUT', '/admin/deliberation', { ...d, lockedAt: 'now' }, admin)).status).toBe(200)
    expect((await call(handler, 'PUT', '/admin/deliberation', d, admin)).status).toBe(423)
    const state = (await call(handler, 'GET', '/state', undefined, admin)).body
    expect(state.deliberation.lockedAt).toBe('now')
    expect(state.judges.find((j: { id: string }) => j.id === 'g2')).toEqual({ id: 'g2', group: 2, name: 'Dr. Example', title: 'Head of Cloud, AWS' })
    expect(JSON.stringify(state)).not.toContain('pinHash')
  })

  it('refuses to lock until every sheet is in, every category tie is picked, and the order fits the winners', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const lockWith = (order: string[]) => call(handler, 'PUT', '/admin/deliberation', { order, log: [], lockedAt: 'now' }, admin)
    await call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: '', status: 'submitted', version: 1 }, g1)
    expect((await lockWith([])).body.code).toBe('not_all_in')

    // Every team scored, but t01 and t02 end equal at the top of Smart Education.
    const winners = await scoreEveryTeam(handler, { t02: FULL })
    expect((await lockWith(winners)).body.code).toBe('tie_open')
    expect((await call(handler, 'PUT', '/ties/education', { teamId: 't02' }, g1)).status).toBe(200)
    const after = winners.map((id) => (id === 't01' ? 't02' : id))
    expect((await lockWith(winners)).body.code).toBe('stale')
    expect((await lockWith(after)).status).toBe(200)
  })

  it('lets the operator enter a paper sheet the tablet never saved', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const body = { sheet: FULL, note: 'from paper', status: 'submitted', reason: 'Tablet failed, paper backup' }
    const r = await call(handler, 'PUT', '/admin/scores/g2/t07', body, admin)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ judgeId: 'g2', teamId: 't07', status: 'submitted', version: 1 })
    expect((await call(handler, 'PUT', '/admin/scores/g9/t07', body, admin)).status).toBe(404)
    expect((await call(handler, 'PUT', '/admin/scores/g2/t99', body, admin)).status).toBe(404)
  })

  it('throws typed errors from the service', async () => {
    const { service } = await setup()
    await expect(service.login('abc')).rejects.toBeInstanceOf(ApiError)
  })
})
