import { describe, expect, it } from 'vitest'
import { hashPin } from './auth'
import { makeHandler } from './handler'
import { ApiError, CORRECTION_STEP, JudgingService, LOGIN_MAX_FAILURES } from './service'
import { memoryStore } from './store'
import { CATEGORIES, TEAMS } from '../../web/src/domain/teams'
import { proposeRanks, rankCategory } from '../../web/src/domain/ranking'
import { submittedSheets } from '../../web/src/domain/ties'

const SECRET = 'test-secret-test-secret-test-secret'
const FULL = { d1: 3, d2: 3, d3: 3, d4: 4, d5: 2, v1: 4, v2: 3, v4: 2 } as const
const PLAIN = { d1: 2, d2: 2, d3: 2, d4: 2, d5: 2, v1: 2, v2: 2, v4: 2 } as const

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

  it('serves the stage screen without a login, with no judges or scores', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    await call(handler, 'PUT', '/admin/runorder', { current: 't01', timer: 'start' }, admin)
    const r = await call(handler, 'GET', '/stage')
    expect(r.status).toBe(200)
    expect(r.body.runOrder).toMatchObject({ current: 't01' })
    expect(r.body.runOrder.startedAt).toBeTruthy()
    expect(Object.keys(r.body).sort()).toEqual(['runOrder', 'serverTime'])
    expect(JSON.stringify(r.body)).not.toMatch(/judge|score|Yashinta/i)
  })

  it('keeps a login for days, so judges can try the app before the event', async () => {
    const store = memoryStore()
    await store.putJudges([{ id: 'g1', group: 1, name: 'Ms. Yashinta', pinHash: hashPin('1111') }])
    let t = Date.parse('2026-10-15T09:00:00Z')
    const service = new JudgingService(store, SECRET, () => new Date(t))
    const handler = makeHandler(service, SECRET)
    const token = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    t = Date.parse('2026-10-20T09:00:00Z')
    const realNow = Date.now
    Date.now = () => t
    try {
      expect((await call(handler, 'GET', '/state', undefined, token)).status).toBe(200)
    } finally {
      Date.now = realNow
    }
  })

  it('logs a device out when its PIN is rotated, and only that device', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const g2 = (await call(handler, 'POST', '/login', { pin: '2222' })).body.token
    await call(handler, 'PUT', '/admin/judges/g1', { name: 'Ms. Yashinta' }, admin)
    expect((await call(handler, 'GET', '/state', undefined, g1)).status).toBe(200)

    await call(handler, 'PUT', '/admin/judges/g1', { pin: '515151' }, admin)
    expect((await call(handler, 'GET', '/state', undefined, g1)).body.code).toBe('unauthorized')
    expect((await call(handler, 'PUT', '/scores/t01', { sheet: { d1: 3 }, note: '', status: 'draft', version: 1 }, g1)).status).toBe(401)
    expect((await call(handler, 'GET', '/state', undefined, g2)).status).toBe(200)
    const again = (await call(handler, 'POST', '/login', { pin: '515151' })).body.token
    expect((await call(handler, 'GET', '/state', undefined, again)).status).toBe(200)
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
    expect(fixed.body.version).toBe(1 + CORRECTION_STEP)
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body
    expect(audit.map((a: { action: string }) => a.action)).toEqual(['close_group', 'correct_score'])
    expect(audit[1].detail.reason).toBe('Judge asked to fix D5')
  })

  it('keeps an operator correction when a tablet comes back with taps it made offline before it', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    await call(handler, 'PUT', '/scores/t01', { sheet: { d1: 2 }, note: '', status: 'draft', version: 3 }, g1)
    // The tablet went dark; the operator keys the judge's paper sheet.
    const paper = { sheet: { ...FULL, d1: 4 }, note: 'paper', status: 'submitted', reason: 'Tablet died, paper backup' }
    expect((await call(handler, 'PUT', '/admin/scores/g1/t01', paper, admin)).status).toBe(200)
    // The tablet revives with 20 more offline taps: stale, and it is handed the correction.
    const late = await call(handler, 'PUT', '/scores/t01', { sheet: { ...FULL, d1: 1 }, note: '', status: 'submitted', version: 23 }, g1)
    expect(late.status).toBe(409)
    expect(late.body.current.sheet).toEqual(paper.sheet)
    // In the judges' deliberation the judge can still change it, from the corrected copy.
    await call(handler, 'PUT', '/admin/runorder', { deliberation: true }, admin)
    const next = await call(handler, 'PUT', '/scores/t01', { sheet: { ...FULL, d1: 3 }, note: 'paper', status: 'submitted', version: late.body.current.version + 1 }, g1)
    expect(next.status).toBe(200)
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

    const set = await call(handler, 'PUT', '/admin/runorder', { order: ['t02', 't01'], current: 't02', timer: 'start' }, admin)
    expect(set.body.order.slice(0, 3)).toEqual(['t02', 't01', 't03'])
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

  it('moves teams only inside their category', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const across = await call(handler, 'PUT', '/admin/runorder', { order: ['t05', 't01'] }, admin)
    expect(across.status).toBe(400)
    expect(across.body.code).toBe('bad_order')
    expect((await call(handler, 'PUT', '/admin/runorder', { order: ['t04', 't03', 't02', 't01'] }, admin)).status).toBe(200)
  })

  it('never goes back to a category that has already presented', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const go = (current: string | null) => call(handler, 'PUT', '/admin/runorder', { current }, admin)
    expect((await go('t03')).status).toBe(200)
    expect((await go('t01')).status).toBe(200) // back inside the same category is fine
    expect((await go('t05')).body.reached).toBe(1)
    const back = await go('t04')
    expect(back.status).toBe(409)
    expect(back.body.code).toBe('no_going_back')
    expect((await go(null)).status).toBe(200) // finishing is fine
    expect((await go('t02')).status).toBe(409) // and still no way back afterwards
    expect((await go('t06')).status).toBe(200)
  })

  it('pauses the pitch timer between the deck and the video', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const put = async (body: object) => (await call(handler, 'PUT', '/admin/runorder', body, admin)).body
    const started = await put({ current: 't01', timer: 'start' })
    const paused = await put({ timer: 'pause' })
    expect(paused.pausedAt).toBeTruthy()
    expect(paused.startedAt).toBe(started.startedAt)
    const resumed = await put({ timer: 'resume' })
    expect(resumed.pausedAt).toBeNull()
    expect(resumed.pausedMs).toBeGreaterThan(0)
    expect((await put({ current: 't02' }))).toMatchObject({ startedAt: null, pausedAt: null, pausedMs: 0 })
  })
})

describe('submitted scores', () => {
  it('are locked until the operator opens the judges\' deliberation, then must be submitted again', async () => {
    const { handler } = await setup()
    const g1 = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const save = (body: object, version: number) => call(handler, 'PUT', '/scores/t01', { sheet: FULL, note: '', status: 'submitted', ...body, version }, g1)
    expect((await save({ status: 'draft', sheet: { d1: 2 } }, 1)).status).toBe(200)
    expect((await save({ sheet: { d1: 2 }, status: 'draft' }, 2)).status).toBe(200) // drafts change freely
    expect((await save({}, 3)).status).toBe(200)
    const late = await save({ sheet: { ...FULL, d1: 1 }, status: 'draft' }, 4)
    expect(late.status).toBe(423)
    expect(late.body.code).toBe('submitted')
    expect(late.body.current.sheet).toEqual(FULL)

    await call(handler, 'PUT', '/admin/runorder', { deliberation: true }, admin)
    expect((await call(handler, 'GET', '/state', undefined, g1)).body.runOrder.deliberation).toBe(true)
    expect((await save({ sheet: { ...FULL, d1: 1 }, status: 'draft' }, 4)).status).toBe(200)
    expect((await save({ sheet: { ...FULL, d1: 1 } }, 5)).status).toBe(200)

    await call(handler, 'PUT', '/admin/runorder', { deliberation: false }, admin)
    expect((await save({ sheet: FULL, status: 'draft' }, 6)).status).toBe(423)
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body.map((a: { action: string }) => a.action)
    expect(audit).toEqual(['open_deliberation', 'close_deliberation'])
  })
})

describe('ties', () => {
  const LOW = { d1: 2, d2: 2, d3: 2, d4: 2, d5: 2, v1: 2, v2: 2, v4: 2 }
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
    expect(r.body).toMatchObject({ judgeId: 'g2', teamId: 't07', status: 'submitted', version: CORRECTION_STEP })
    expect((await call(handler, 'PUT', '/admin/scores/g9/t07', body, admin)).status).toBe(404)
    expect((await call(handler, 'PUT', '/admin/scores/g2/t99', body, admin)).status).toBe(404)
  })

  it('throws typed errors from the service', async () => {
    const { service } = await setup()
    await expect(service.login('abc')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('absent judge', () => {
  async function three() {
    const store = memoryStore()
    await store.putAdminPinHash(hashPin('999999'))
    await store.putJudges([1, 2, 3].map((g) => ({ id: `g${g}`, group: g, name: `Judge ${g}`, pinHash: hashPin(String(g).repeat(4)) })))
    const service = new JudgingService(store, SECRET)
    const handler = makeHandler(service, SECRET)
    const tok = async (pin: string) => (await call(handler, 'POST', '/login', { pin })).body.token as string
    return { store, handler, admin: await tok('999999'), judges: [await tok('1111'), await tok('2222'), await tok('3333')] }
  }

  it('leaves the panel: sheets stop counting, the lock and ties use the judges who are there', async () => {
    const { handler, admin, judges } = await three()
    // Judges 1 and 2 submit everything; judge 3 scores one team and leaves.
    for (const t of TEAMS) for (const tok of judges.slice(0, 2)) await call(handler, 'PUT', `/scores/${t.id}`, { sheet: t.id === 't02' || t.order % 4 === 1 ? FULL : PLAIN, note: '', status: 'submitted', version: 1 }, tok)
    await call(handler, 'PUT', '/scores/t01', { sheet: PLAIN, note: '', status: 'submitted', version: 1 }, judges[2])
    const before = (await call(handler, 'GET', '/state', undefined, admin)).body
    expect(before.ties).toEqual([])
    expect((await call(handler, 'POST', '/admin/judges/g3/absent', { absent: true }, judges[0])).status).toBe(403)
    expect((await call(handler, 'POST', '/admin/judges/g3/absent', { absent: true }, admin)).status).toBe(200)
    const st = (await call(handler, 'GET', '/state', undefined, admin)).body
    expect(st.judges.map((j: { id: string }) => j.id)).toEqual(['g1', 'g2'])
    expect(st.absentJudges.map((j: { id: string }) => j.id)).toEqual(['g3'])
    expect(st.scores.some((s: { judgeId: string }) => s.judgeId === 'g3')).toBe(false)
    // t01 and t02 are now tied in education across the two judges who are there.
    expect(st.ties.map((t: { category: string }) => t.category)).toEqual(['education'])
    // The absent judge's tablet is told, and its saves are refused.
    const mine = (await call(handler, 'GET', '/state', undefined, judges[2])).body
    expect(mine.absent).toBe(true)
    expect((await call(handler, 'PUT', '/scores/t02', { sheet: PLAIN, note: '', status: 'draft', version: 1 }, judges[2])).body.code).toBe('absent')
    // The last two judges cannot both leave.
    expect((await call(handler, 'POST', '/admin/judges/g2/absent', { absent: true }, admin)).body.code).toBe('panel_too_small')
    // Back on the panel: their sheet counts again.
    await call(handler, 'POST', '/admin/judges/g3/absent', { absent: false }, admin)
    expect((await call(handler, 'GET', '/state', undefined, admin)).body.judges).toHaveLength(3)
    const audit = (await call(handler, 'GET', '/admin/audit', undefined, admin)).body.map((a: { action: string }) => a.action)
    expect(audit).toEqual(expect.arrayContaining(['judge_absent', 'judge_back']))
  })
})

describe('guards found in the 16 Oct UAT', () => {
  it('needs a longer phrase to reset a locked result, and archives the data first', async () => {
    const { handler, store } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    await scoreEveryTeam(handler)
    const sheets = submittedSheets(await store.listScores())
    const order = proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, sheets))).map((p) => p.winner.team.id)
    const r = await call(handler, 'PUT', '/admin/deliberation', { order, log: [], lockedAt: '2026-10-20T10:00:00Z' }, admin)
    expect(r.status).toBe(200)
    expect((await call(handler, 'POST', '/admin/reset', { confirm: 'RESET' }, admin)).body.code).toBe('confirm_required')
    const done = await call(handler, 'POST', '/admin/reset', { confirm: 'RESET LOCKED RESULT' }, admin)
    expect(done.status).toBe(200)
    expect(await store.listScores()).toEqual([])
  })

  it('refuses a rank change without a reason, and malformed bodies with 400', async () => {
    const { handler } = await setup()
    const admin = (await call(handler, 'POST', '/login', { pin: '999999' })).body.token
    const r = await call(handler, 'PUT', '/admin/deliberation', { order: [], log: [{ at: 'x', teamId: 't01', from: 1, to: 2, reason: ' ' }], lockedAt: null }, admin)
    expect(r.body.code).toBe('reason_required')
    const judge = (await call(handler, 'POST', '/login', { pin: '1111' })).body.token
    for (const body of [null, [], { sheet: null, note: '', status: 'draft', version: 1 }]) {
      expect((await call(handler, 'PUT', '/scores/t01', body, judge)).status).toBe(400)
    }
    expect((await call(handler, 'POST', '/login', null)).status).toBe(400)
  })
})

describe('PIN guessing', () => {
  it('pauses every login after too many wrong PINs, keeps logged-in devices working, and reopens after the window', async () => {
    const store = memoryStore()
    await store.putJudges([{ id: 'g1', group: 1, name: 'J1', pinHash: hashPin('111111') }])
    let t = Date.parse('2026-10-20T01:00:00Z')
    const service = new JudgingService(store, SECRET, () => new Date(t))
    const handler = makeHandler(service, SECRET)
    const tok = (await call(handler, 'POST', '/login', { pin: '111111' })).body.token
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) expect((await call(handler, 'POST', '/login', { pin: String(200000 + i) })).status).toBe(401)
    const blocked = await call(handler, 'POST', '/login', { pin: '111111' })
    expect(blocked.status).toBe(429)
    expect(blocked.body.code).toBe('too_many_tries')
    expect((await call(handler, 'GET', '/state', undefined, tok)).status).toBe(200)
    t += 16 * 60_000
    expect((await call(handler, 'POST', '/login', { pin: '111111' })).status).toBe(200)
  })
})
