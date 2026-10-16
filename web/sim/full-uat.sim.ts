// Full UAT (16 Oct 2026): ideal and worst-case scenarios against the real API handler
// and the real tablet sync code, behind the simulated API Gateway in harness.ts.
//   npm run sim -- full-uat        (writes sim/full-uat.json, or SIM_OUT)
// Each scenario records PASS / FAIL / INFO with its evidence instead of stopping at the
// first failure, so one run gives the whole picture.

import { writeFileSync } from 'node:fs'
import { afterAll, describe, it } from 'vitest'
import { signToken } from '../../api/src/auth'
import { applyOrder, moveRank, EMPTY_DELIBERATION, lock } from '../src/domain/deliberation'
import { announcementOrder, proposeRanks, rankCategory } from '../src/domain/ranking'
import { elapsedSeconds, timerClock, stepCurrent, normalizeRunOrder } from '../src/domain/runOrder'
import { CRITERIA, FINAL_SCALE, finalScaled, finalScore, WEIGHTS, type Level, type ScoreSheet } from '../src/domain/scoring'
import { SEGMENTS } from '../src/domain/rubric'
import { CATEGORIES, TEAMS } from '../src/domain/teams'
import { submittedSheets } from '../src/domain/ties'
import { Api, ApiError } from '../src/sync/api'
import { sleep, startServer, Tablet } from './harness'

type Result = 'PASS' | 'FAIL' | 'INFO'
const OUT = process.env.SIM_OUT ?? 'sim/full-uat.json'
const results: { id: string; scenario: string; result: Result; evidence: unknown }[] = []
afterAll(() => writeFileSync(OUT, JSON.stringify(results, null, 2)))
const record = (id: string, scenario: string, ok: boolean | 'info', evidence: unknown) =>
  void results.push({ id, scenario, result: ok === 'info' ? 'INFO' : ok ? 'PASS' : 'FAIL', evidence })

const PINS = ['111111', '222222', '333333', '444444', '555555']
const ADMIN = '99999999'
const SECRET = 'sim-secret-sim-secret-sim-secret-sim!'
const fast = { latency: 0, rate: 1e6, burst: 1e6 }

const sheetOf = (levels: Level[]) => Object.fromEntries(CRITERIA.map((k, i) => [k, levels[i]])) as ScoreSheet
const all = (l: Level) => sheetOf(CRITERIA.map(() => l))

async function status(p: Promise<unknown>): Promise<number | string> {
  try {
    await p
    return 200
  } catch (e) {
    return e instanceof ApiError ? `${e.status} ${e.code}` : `throw ${(e as Error).message}`
  }
}

async function raw(base: string, method: string, path: string, body?: string, token?: string) {
  const r = await fetch(base + path, { method, body, headers: token ? { authorization: `Bearer ${token}` } : {} })
  return `${r.status} ${(await r.json().catch(() => ({})))?.code ?? ''}`.trim()
}

async function setup(net: Parameters<typeof startServer>[0] = fast) {
  const srv = await startServer(net)
  const admin = new Api(srv.base, (await new Api(srv.base).login(ADMIN)).token)
  const tablets = await Promise.all(PINS.map((p) => Tablet.login(srv.base, p)))
  return { srv, admin, tablets }
}

/** Every judge submits every team with `pick(judgeIndex, team)` through the tablet store and sync. */
async function scoreAll(tablets: Tablet[], pick: (j: number, teamId: string) => ScoreSheet) {
  for (const [j, t] of tablets.entries()) {
    for (const team of TEAMS) {
      await t.store.save(t.judgeId, team.id, { sheet: pick(j, team.id) })
      await t.store.save(t.judgeId, team.id, { status: 'submitted' })
    }
    await t.round()
  }
}

/** Record the first tied team for every open category tie, then lock with the proposed order. */
async function pickTiesAndLock(admin: Api) {
  const st = await admin.state()
  for (const t of st.ties) await admin.pickTieWinner(t.category, t.tied[0].teamId)
  const s2 = await admin.state()
  const ranks = applyOrder(proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(s2.scores), s2.tieBreaks?.[c.id]?.teamId))), EMPTY_DELIBERATION).ranks
  return { ties: st.ties.length, lock: await status(admin.putDeliberation(lock(ranks, EMPTY_DELIBERATION))) }
}

/** Deterministic varied scores: no ties unless a scenario forces one. */
const varied = (j: number, teamId: string): ScoreSheet => {
  const n = Number(teamId.slice(1))
  return sheetOf(CRITERIA.map((_, i) => (1 + ((n * 7 + i * 3 + j * 5 + ((n * i) % 3)) % 4)) as Level))
}

describe('full UAT', () => {
  it('I01 rubric: 8 criteria, weights and shown percentages agree, 25-100', () => {
    const shown = SEGMENTS.flatMap((s) => s.criteria)
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
    const pctOk = shown.every((c) => Math.abs(parseFloat(c.weight) - (WEIGHTS[c.key] / total) * 100) < 0.051)
    const codes = shown.map((c) => c.code).join(',')
    const levelsOk = shown.every((c) => [1, 2, 3, 4].every((l) => (c.levels as Record<number, string>)[l]?.trim().length > 5))
    const keys = new Set(shown.map((c) => c.key))
    record('I01', 'Rubric: 8 criteria numbered 1-8, every level described, % shown = weights', shown.length === 8 && keys.size === 8 && CRITERIA.every((k) => keys.has(k)) && pctOk && codes === '1,2,3,4,5,6,7,8' && levelsOk && finalScore(all(1)) === 25 && finalScore(all(4)) === 100, {
      criteria: shown.map((c) => `${c.code} ${c.name} ${c.weight}`), sumOfShown: shown.reduce((a, c) => a + parseFloat(c.weight), 0).toFixed(1), min: finalScore(all(1)), max: finalScore(all(4)),
    })
  })

  it('I02 math: all 65,536 possible sheets give the exact weighted score, rounded half-up', () => {
    let bad = 0
    let n = 0
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
    const rec = (i: number, acc: Level[]) => {
      if (i === CRITERIA.length) {
        n++
        const s = sheetOf(acc)
        // Exact reference: percentage = Σ w·level / (4·Σ w) × 100, as a fraction num/den.
        const num = CRITERIA.reduce((a, k) => a + WEIGHTS[k] * s[k], 0) * 100
        const den = 4 * total
        const ref = Math.floor((2 * num + den) / (2 * den))
        if (ref !== finalScore(s) || finalScaled(s) !== num / 100) bad++
        return
      }
      for (const l of [1, 2, 3, 4] as Level[]) rec(i + 1, [...acc, l])
    }
    rec(0, [])
    record('I02', 'Score math: every possible sheet (4^8) matches the exact formula', bad === 0 && n === 65536, { sheets: n, mismatches: bad })
  })

  it('I03 ideal event: 5 tablets, 20 teams in running order, timer, 100 sheets, ranks, lock, MC order', async () => {
    const { srv, admin, tablets } = await setup()
    const ev: Record<string, unknown> = {}
    let ro = await admin.state().then((s) => s.runOrder)
    let presented = 0
    let timerOk = true
    for (;;) {
      const step = stepCurrent(ro, 1)
      if (!step.current) break
      ro = await admin.putRunOrder({ current: step.current, timer: 'start' })
      await admin.putRunOrder({ timer: 'pause' })
      await sleep(30)
      ro = await admin.putRunOrder({ timer: 'resume' })
      const clock = timerClock(ro)!
      if (!clock || elapsedSeconds(clock, Date.now()) > 2) timerOk = false
      presented++
      // Every tablet sees the team on stage, scores it and submits.
      for (const [j, t] of tablets.entries()) {
        await t.round()
        const cur = t.last?.runOrder?.current
        if (cur !== step.current) timerOk = false
        for (const k of CRITERIA) await t.store.save(t.judgeId, cur!, { sheet: { [k]: varied(j, cur!)[k] } })
        await t.store.save(t.judgeId, cur!, { status: 'submitted' })
        await t.round()
      }
    }
    await admin.putRunOrder({ current: null })
    const st = await admin.state()
    const submitted = st.scores.filter((s) => s.status === 'submitted')
    const exact = submitted.every((s) => JSON.stringify(s.sheet) === JSON.stringify(sheetOf(CRITERIA.map((k) => varied(PINS.indexOf(String(Number(s.judgeId[1])).repeat(6)), s.teamId)[k]))))
    const sheets = submittedSheets(st.scores)
    const standings = CATEGORIES.map((c) => rankCategory(c.id, TEAMS, sheets, st.tieBreaks?.[c.id]?.teamId))
    const ranks = applyOrder(proposeRanks(standings), EMPTY_DELIBERATION).ranks
    let lockStatus: number | string = 'not tried'
    if (st.ties.length === 0) lockStatus = await status(admin.putDeliberation(lock(ranks, EMPTY_DELIBERATION)))
    const after = await admin.state()
    Object.assign(ev, {
      presented, timerAndStageFollowOperator: timerOk, submittedOnServer: submitted.length, serverEqualsTaps: exact,
      tiesOffered: st.ties.length, winners: ranks.map((r) => `${r.rank} ${r.award}: ${r.winner.team.appName} (${r.winner.final})`),
      lock: lockStatus, lockedFlag: after.locked,
      mcOrder: announcementOrder(ranks).map((r) => r.award),
      auditActions: [...new Set((await admin.audit()).map((a) => a.action))],
    })
    record('I03', 'Ideal event end to end (20 teams x 5 judges, running order, timer, lock)', presented === 20 && timerOk && submitted.length === 100 && exact && lockStatus === 200 && after.locked === true
      && (ev.mcOrder as string[])[0] === 'Rising Innovator' && (ev.mcOrder as string[])[4] === 'Winner of AWS CendekiAwan', ev)
    // After the lock everything that moves a result is refused.
    const t0 = tablets[0]
    const frozen = {
      judgeSave: await status(t0.api.saveScore({ teamId: 't01', sheet: all(4), note: '', status: 'submitted', version: 999 })),
      correction: await status(admin.correctScore('g1', 't01', { sheet: all(4), note: '', status: 'submitted' }, 'late')),
      deliberation: await status(admin.putDeliberation({ ...EMPTY_DELIBERATION, order: [] })),
      tiePick: await status(t0.api.pickTieWinner('education', 't01')),
      reopenDeliberation: await status(admin.putRunOrder({ deliberation: true })),
    }
    await t0.round()
    record('I04', 'After Lock result: judge save, correction, deliberation and tie pick refused (423)', frozen.judgeSave === '423 locked' && frozen.correction === '423 locked' && frozen.deliberation === '423 locked' && String(frozen.tiePick).startsWith('423'),
      { ...frozen, tabletTreatsAllCategoriesClosed: t0.last?.closedGroups.length === 5 })
    const reset = await status(admin.resetEventData())
    const resetPhrase = await status(admin.resetEventData('RESET LOCKED RESULT'))
    record('W01', 'After Lock, plain RESET is refused; only the longer phrase resets (with an archive)', reset !== 200 && resetPhrase === 200, { resetAfterLock: reset, withLongPhrase: resetPhrase })
    await srv.close()
  }, 120_000)

  it('I05 tie at a category top: only after every judge submitted, only the owner judge sees and picks it', async () => {
    const { srv, admin, tablets } = await setup()
    // Education teams t01 and t02 get identical sheets from every judge: exact tie.
    const pick = (j: number, teamId: string) => (teamId === 't01' || teamId === 't02' ? all(4) : varied(j, teamId).d1 === 4 ? { ...varied(j, teamId), d1: 3 } as ScoreSheet : varied(j, teamId))
    // Four judges first: no tie offered yet.
    await scoreAll(tablets.slice(0, 4), pick)
    const partial = (await admin.state()).ties.length
    await scoreAll(tablets.slice(4), (_, t) => pick(4, t))
    for (const t of tablets) await t.round()
    const st = await admin.state()
    const seen = tablets.map((t) => t.last?.ties?.length ?? 0)
    const ev = {
      tiesWithFourJudges: partial, tiesAfterAll: st.ties.map((t) => `${t.category}: ${t.tied.map((x) => x.teamId)}`), tabletsSeeingTie: seen,
      nonOwnerPick: await status(tablets[1].api.pickTieWinner('education', 't02')),
      notTiedTeam: await status(tablets[0].api.pickTieWinner('education', 't03')),
      lockBeforePick: await status(admin.putDeliberation({ ...EMPTY_DELIBERATION, order: proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st.scores)))).map((r) => r.winner.team.id), lockedAt: new Date().toISOString() })),
      ownerPick: await status(tablets[0].api.pickTieWinner('education', 't02')),
    }
    const st2 = await admin.state()
    const standings = CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st2.scores), st2.tieBreaks?.[c.id]?.teamId))
    const winnerEdu = standings[0].ranked[0].team.id
    record('I05', 'Category tie: offered only when complete, only to the owner judge, pick decides the winner', partial === 0 && st.ties.length >= 1 && seen[0] === 1 && seen.slice(1).every((x) => x === 0)
      && ev.nonOwnerPick === '403 forbidden' && ev.notTiedTeam === '400 not_tied' && ev.lockBeforePick === '409 tie_open' && ev.ownerPick === 200 && winnerEdu === 't02', { ...ev, educationWinnerAfterPick: winnerEdu })
    // Operator can record the pick on behalf of the judge, and it can be changed.
    const opPick = await status(admin.pickTieWinner('education', 't01'))
    record('I06', 'Operator records a tie pick on behalf of the owner judge (logged)', opPick === 200 && (await admin.audit()).filter((a) => a.action === 'tie_pick').length === 2, { opPick })
    await srv.close()
  }, 60_000)

  it('I07 deliberation: exactly tied winners swap with a reason; others cannot; edits need a new Submit', async () => {
    const { srv, admin, tablets } = await setup()
    // Category winners t01 (education) and t05 (health) get the same sheets: exactly equal averages.
    const winners = new Set(['t01', 't05'])
    const pick = (j: number, teamId: string) => (winners.has(teamId) ? all(4) : { ...varied(j, teamId), d1: 1 } as ScoreSheet)
    await scoreAll(tablets, pick)
    const st = await admin.state()
    const proposed = proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st.scores))))
    const ranks = applyOrder(proposed, EMPTY_DELIBERATION).ranks
    const i1 = ranks.findIndex((r) => r.winner.team.id === 't01') + 1
    const i5 = ranks.findIndex((r) => r.winner.team.id === 't05') + 1
    const swapped = moveRank(ranks, EMPTY_DELIBERATION, i5, i1, 'Judges preferred the stronger demo')
    const okSwap = await status(admin.putDeliberation(swapped))
    // A crafted order that puts a lower average above a higher one is refused by the server.
    const ids = ranks.map((r) => r.winner.team.id)
    const bad = { ...swapped, order: [ids[4], ...ids.slice(0, 4)], log: [...swapped.log, { at: new Date().toISOString(), teamId: ids[4], from: 5, to: 1, reason: 'x' }] }
    const badSwap = await status(admin.putDeliberation(bad))
    const shorterLog = await status(admin.putDeliberation({ ...swapped, log: [] }))
    // Deliberation open: a judge edits a submitted sheet; it becomes a draft and lock waits.
    const closedEdit = await status(tablets[2].api.saveScore({ teamId: 't09', sheet: all(3), note: '', status: 'draft', version: 50 }))
    await admin.putRunOrder({ deliberation: true })
    await tablets[2].store.save('g3', 't09', { sheet: { d1: 2 }, status: 'draft' })
    await tablets[2].round()
    const st2 = await admin.state()
    const lockWhileDraft = await status(admin.putDeliberation(lock(applyOrder(proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st2.scores)))), swapped).ranks, swapped)))
    await tablets[2].store.save('g3', 't09', { status: 'submitted' })
    await tablets[2].round()
    const st3 = await admin.state()
    const finalRanks = applyOrder(proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st3.scores)))), swapped).ranks
    const lockAfter = await status(admin.putDeliberation(lock(finalRanks, swapped)))
    const audit = (await admin.audit()).filter((a) => a.action === 'reorder_rank')
    const emptyReason = await status(admin.putDeliberation({ ...swapped, lockedAt: null, log: [...swapped.log, { at: new Date().toISOString(), teamId: 't01', from: 1, to: 1, reason: '' }] }))
    record('I07', 'Deliberation: tied winners swap with reason, untied cannot, judge edit needs re-submit before Lock',
      okSwap === 200 && badSwap === '409 not_tied' && shorterLog === '409 stale' && closedEdit === '423 submitted' && lockWhileDraft === '409 not_all_in' && lockAfter === 200 && audit.length === 1,
      { tiedRanks: [i1, i5], okSwap, badSwap, shorterLog, editBeforeDeliberationOpen: closedEdit, lockWhileJudgeHasDraft: lockWhileDraft, lockAfterResubmit: lockAfter, reorderLogged: audit.map((a) => a.detail.reason) })
    record('W02', 'Server refuses a rank change with an empty reason', emptyReason !== 200, { emptyReason, note: 'Only the operator UI checks the reason; the API stores a blank one' })
    await srv.close()
  }, 60_000)

  it('I08 timer: pause/resume math, double pause, resume without pause, new team resets, clock skew', async () => {
    const { srv, admin } = await setup()
    await admin.putRunOrder({ current: 't01', timer: 'start' })
    await sleep(1100)
    await admin.putRunOrder({ timer: 'pause' })
    const p1 = await admin.putRunOrder({ timer: 'pause' })
    await sleep(1200)
    const r1 = await admin.putRunOrder({ timer: 'resume' })
    const r2 = await admin.putRunOrder({ timer: 'resume' })
    const el = elapsedSeconds(timerClock(r2)!, Date.now())
    // A tablet whose clock is 5 minutes fast still shows the same elapsed time.
    const skew = 5 * 60_000
    const tabletEl = elapsedSeconds(timerClock(r2, -skew)!, Date.now() + skew)
    const next = await admin.putRunOrder({ current: 't02' })
    const noTeam = await admin.putRunOrder({ current: null, timer: 'start' })
    record('I08', 'Pitch timer: pause holds, double pause/resume harmless, new team resets, skewed tablet clock matches',
      el === 1 && tabletEl === el && p1.pausedAt !== null && r1.pausedMs! >= 1100 && r2.pausedMs === r1.pausedMs && next.startedAt === null && noTeam.startedAt === null,
      { elapsedAfter1sRun1sPause: el, skewedTablet: tabletEl, pausedMs: r1.pausedMs, nextTeamStartedAt: next.startedAt, startWithNoTeam: noTeam.startedAt })
    await srv.close()
  }, 30_000)

  it('I09 running order: moves only inside a category, never back to a finished category', async () => {
    const { srv, admin } = await setup()
    const order = TEAMS.map((t) => t.id)
    const swapIn = [order[1], order[0], ...order.slice(2)]
    const ok = await status(admin.putRunOrder({ order: swapIn }))
    const cross = await status(admin.putRunOrder({ order: [order[4], ...order.slice(1, 4), order[0], ...order.slice(5)] }))
    const junk = await admin.putRunOrder({ order: ['zz', order[1], order[1], ...order] }).then((r) => r.order.length).catch((e) => e.message)
    await admin.putRunOrder({ current: 't05' })
    const back = await status(admin.putRunOrder({ current: 't01' }))
    const within = await status(admin.putRunOrder({ current: 't06' }))
    const withinBack = await status(admin.putRunOrder({ current: 't05' }))
    const unknown = await admin.putRunOrder({ current: 'zzz' }).then((r) => r.current).catch(() => null)
    record('I09', 'Running order rules (inside category only; no going back; unknown teams ignored)',
      ok === 200 && cross === '400 bad_order' && back === '409 no_going_back' && within === 200 && withinBack === 200 && unknown === null && (junk === 20 || typeof junk === 'string'),
      { reorderInside: ok, crossCategory: cross, duplicatesAndUnknown: junk, backToFinishedCategory: back, nextInSameCategory: within, backInsideSameCategory: withinBack, unknownCurrent: unknown })
    await srv.close()
  }, 30_000)

  it('S01 access control: every route checks the token and the role', async () => {
    const { srv, admin, tablets } = await setup()
    const j = tablets[0].api.token!
    const a = admin.token!
    const b = srv.base
    const expired = signToken({ role: 'admin', sub: 'admin', exp: Math.floor(Date.now() / 1000) - 10, key: JSON.parse(Buffer.from(a.split('.')[0], 'base64url').toString()).key }, SECRET)
    const forgedRole = `${Buffer.from(JSON.stringify({ role: 'admin', sub: 'admin', exp: 9e9 })).toString('base64url')}.${j.split('.')[1]}`
    const judgeOnAdmin = await Promise.all([
      raw(b, 'GET', '/admin/audit', undefined, j), raw(b, 'POST', '/admin/reset', '{"confirm":"RESET"}', j),
      raw(b, 'PUT', '/admin/runorder', '{"current":"t01"}', j), raw(b, 'PUT', '/admin/scores/g2/t01', '{"reason":"x"}', j),
      raw(b, 'POST', '/admin/groups/1', '{"closed":true}', j), raw(b, 'PUT', '/admin/judges/g1', '{"name":"x"}', j),
      raw(b, 'PUT', '/admin/deliberation', '{"order":[],"log":[],"lockedAt":null}', j),
    ])
    const ev = {
      noToken: await raw(b, 'GET', '/state'), garbage: await raw(b, 'GET', '/state', undefined, 'x.y'), expired: await raw(b, 'GET', '/state', undefined, expired),
      forgedRole: await raw(b, 'GET', '/admin/audit', undefined, forgedRole), judgeOnAdminRoutes: judgeOnAdmin,
      adminSavesAsJudge: await raw(b, 'PUT', '/scores/t01', JSON.stringify({ sheet: {}, note: '', status: 'draft', version: 1 }), a),
      judgeSeesOnlyOwnSheets: null as unknown,
    }
    await tablets[1].store.save('g2', 't01', { sheet: { d1: 3 } })
    await tablets[1].round()
    const own = await tablets[0].api.state()
    ev.judgeSeesOnlyOwnSheets = { scores: own.scores.length, judges: own.judges.map((x) => x.id), hasAudit: 'presence' in own || 'deliberation' in own }
    record('S01', 'Access control: no/expired/forged tokens 401; judge on every admin route 403; judge sees only own data',
      ev.noToken === '401 unauthorized' && ev.garbage === '401 unauthorized' && ev.expired === '401 unauthorized' && ev.forgedRole === '401 unauthorized'
      && judgeOnAdmin.every((x) => x === '403 forbidden') && ev.adminSavesAsJudge === '403 forbidden' && own.scores.length === 0 && own.judges.length === 1 && !('presence' in own), ev)
    // Stage screen is public and leaks nothing.
    const stage = await (await fetch(`${b}/stage`)).json()
    record('S02', 'Public stage endpoint shows only running order and timer', JSON.stringify(Object.keys(stage).sort()) === '["runOrder","serverTime"]' && !/judge|score|sheet|Yashinta|Kresna/i.test(JSON.stringify(stage)), { keys: Object.keys(stage) })
    await srv.close()
  }, 30_000)

  it('S03 input validation on score sheets (bad levels, keys, notes, versions, bodies)', async () => {
    const { srv, tablets } = await setup()
    const j = tablets[0].api.token!
    const put = (body: unknown, team = 't01') => raw(srv.base, 'PUT', `/scores/${team}`, typeof body === 'string' ? body : JSON.stringify(body), j)
    let v = 1
    const ok = (extra: object) => ({ sheet: { d1: 3 }, note: '', status: 'draft', version: v++, ...extra })
    const ev = {
      level0: await put(ok({ sheet: { d1: 0 } })), level5: await put(ok({ sheet: { d1: 5 } })), levelHalf: await put(ok({ sheet: { d1: 2.5 } })),
      levelString: await put(ok({ sheet: { d1: '3' } })), oldCriterionV3: await put(ok({ sheet: { v3: 3 } })), unknownKey: await put(ok({ sheet: { x: 1 } })),
      note201: await put(ok({ note: 'a'.repeat(201) })), note200: await put(ok({ note: 'a'.repeat(200) })), noteNumber: await put(ok({ note: 5 })),
      statusFinal: await put(ok({ status: 'final' })), versionFloat: await put(ok({ version: 1.5 })), versionString: await put(ok({ version: '9' })),
      submitIncomplete: await put(ok({ status: 'submitted' })), unknownTeam: await put(ok({}), 't99'), notJson: await put('{nope'),
      sheetNull: await put(ok({ sheet: null })), bodyNull: await put('null'), bodyArray: await put('[]'),
      loginBodyNull: await raw(srv.base, 'POST', '/login', 'null'), loginPinNumber: await raw(srv.base, 'POST', '/login', '{"pin":111111}'),
      loginShort: await raw(srv.base, 'POST', '/login', '{"pin":"12"}'), loginLetters: await raw(srv.base, 'POST', '/login', '{"pin":"abcdef"}'),
    }
    const want400 = ['level0', 'level5', 'levelHalf', 'levelString', 'oldCriterionV3', 'unknownKey', 'note201', 'noteNumber', 'statusFinal', 'versionFloat', 'versionString', 'submitIncomplete', 'notJson'] as const
    record('S03', 'Score validation rejects bad levels, unknown criteria (incl. old V3), long notes, bad status/version (400)',
      want400.every((k) => ev[k].startsWith('400')) && ev.note200 === '200' && ev.unknownTeam === '404 not_found' && ev.loginPinNumber.startsWith('200') && ev.loginShort === '401 bad_pin', ev)
    const crash = (['sheetNull', 'bodyNull', 'bodyArray', 'loginBodyNull'] as const).filter((k) => ev[k].startsWith('500'))
    record('W03', 'Malformed bodies (null sheet, null/array body) answer 500 instead of 400', crash.length === 0, { answered500: crash.map((k) => `${k}: ${ev[k]}`) })
    await srv.close()
  }, 30_000)

  it('S04 PINs: rotation logs the old device out; duplicates refused; brute-force exposure', async () => {
    const { srv, admin, tablets } = await setup()
    const before = await status(tablets[0].api.state())
    const taken = await status(admin.updateJudge('g1', { pin: '222222' }))
    const asAdmin = await status(admin.updateJudge('g1', { pin: ADMIN }))
    const short = await status(admin.updateJudge('g1', { pin: '1234' }))
    const rotated = await status(admin.updateJudge('g1', { pin: '777777' }))
    const after = await status(tablets[0].api.state())
    await tablets[0].round()
    const oldPin = await status(new Api(srv.base).login('111111'))
    const newPin = await status(new Api(srv.base).login('777777'))
    const auditHasPin = JSON.stringify(await admin.audit()).includes('777777')
    record('S04', 'PIN change: old tablet logged out on next sync, old PIN refused, duplicate/operator/short PIN refused, PIN never in log',
      before === 200 && taken === '409 pin_taken' && asAdmin === '409 pin_taken' && short === '400 bad_pin' && rotated === 200 && after === '401 unauthorized' && tablets[0].last?.error === 'unauthorized' && oldPin === '401 bad_pin' && newPin === 200 && !auditHasPin,
      { before, taken, asAdmin, short, rotated, oldDeviceAfter: after, tabletRound: tablets[0].last?.error, oldPin, newPin, auditHasPin })
    // Brute force: PINs are 6 digits for judges (8 for the operator); API Gateway allows 10 logins/s.
    const space = 1e6
    const hoursToFindAnyJudge = space / 5 / 10 / 3600 / 2
    record('S05', 'PIN guessing exposure (no lockout; throttle only)', 'info', {
      loginThrottle: '10 req/s, burst 20 (template.yaml)', lockoutAfterFailures: 'none',
      expectedHoursToGuessSomeJudgePinAt10PerSecond: +hoursToFindAnyJudge.toFixed(1),
      note: 'Rotating every PIN on the event morning (planned) limits the window to the event day; a stolen judge PIN can only score as that judge',
    })
    await srv.close()
  }, 30_000)

  it('W04 a sheet the server refuses (400) must not block the tablet\'s other sheets', async () => {
    const { srv, tablets } = await setup()
    const t = tablets[0]
    // A record from before the 8-criteria rubric (V3) left on the tablet, then two good sheets.
    await t.store.save('g1', 't01', { sheet: { ...all(3), v3: 3 } as never })
    await t.store.save('g1', 't01', { status: 'submitted' })
    for (const team of ['t02', 't03']) {
      await t.store.save('g1', team, { sheet: all(3) })
      await t.store.save('g1', team, { status: 'submitted' })
    }
    await t.round()
    const server = (await srv.store.listScores()).map((s) => s.teamId)
    record('W04', 'One refused sheet (e.g. an old-rubric V3 sheet) blocks every other sheet on that tablet', server.includes('t02') && server.includes('t03') && t.last?.online === true,
      { serverHas: server, tabletShows: t.last?.online ? `online, ${t.last.waiting} waiting` : `Offline (${t.last?.error})`, waiting: t.last?.waiting })
    await srv.close()
  }, 30_000)

  it('W05 Wi-Fi down, 5 tablets build a backlog of 15 sheets, then reconnect', async () => {
    const { srv, tablets } = await setup({ latency: 80 })
    srv.cfg.mode = 'down'
    for (const t of tablets) {
      for (const team of TEAMS.slice(0, 3)) {
        for (const k of CRITERIA) await t.store.save(t.judgeId, team.id, { sheet: { [k]: 3 } })
        await t.store.save(t.judgeId, team.id, { status: 'submitted' })
      }
      await t.round()
    }
    const offline = tablets.every((t) => t.last && !t.last.online && t.last.waiting === 3)
    srv.cfg.mode = 'up'
    const t0 = Date.now()
    for (const t of tablets) await t.round()
    const server = (await srv.store.listScores()).filter((s) => s.status === 'submitted').length
    record('W05', 'Venue Wi-Fi outage: tablets show Offline with n saved; all sheets land after reconnect', offline && server === 15, { shownOfflineWith3Saved: offline, submittedOnServer: server, ms: Date.now() - t0 })
    await srv.close()
  }, 60_000)

  it('W06 dead tablet: paper sheet keyed by the operator survives the tablet\'s older offline taps', async () => {
    const { srv, admin, tablets } = await setup()
    const t = tablets[1]
    await t.store.save('g2', 't03', { sheet: { d1: 2 } })
    await t.round()
    srv.cfg.mode = 'down'
    for (const k of CRITERIA) await t.store.save('g2', 't03', { sheet: { [k]: 2 } })
    await t.store.save('g2', 't03', { status: 'submitted' })
    srv.cfg.mode = 'up'
    await admin.correctScore('g2', 't03', { sheet: all(4), note: 'paper', status: 'submitted' }, 'tablet died, paper backup')
    const neverSent = await status(admin.correctScore('g2', 't04', { sheet: all(2), note: '', status: 'submitted' }, 'paper only'))
    const noReason = await status(admin.correctScore('g2', 't04', { sheet: all(2), note: '', status: 'submitted' }, '  '))
    await t.round()
    const s = await srv.store.getScore('g2', 't03')
    const local = await t.store.get('g2', 't03')
    record('W06', 'Operator correction from paper wins over stale offline taps; sheet never sent can be keyed; reason required',
      JSON.stringify(s?.sheet) === JSON.stringify(all(4)) && JSON.stringify(local?.sheet) === JSON.stringify(all(4)) && neverSent === 200 && noReason === '400 reason_required',
      { serverAfter: s?.sheet, tabletAfter: local?.sheet, neverSent, noReason })
    await srv.close()
  }, 30_000)

  it('W07 closed category: saves refused, tablet takes the server copy; reopen works', async () => {
    const { srv, admin, tablets } = await setup()
    const t = tablets[0]
    await t.store.save('g1', 't05', { sheet: { d1: 2 } })
    await t.round()
    await admin.setGroupClosed(2, true)
    await t.store.save('g1', 't05', { sheet: { d1: 4 } })
    await t.round()
    const local = await t.store.get('g1', 't05')
    const direct = await status(t.api.saveScore({ teamId: 't06', sheet: { d1: 1 }, note: '', status: 'draft', version: 1 }))
    const badGroup = await Promise.all([0, 6].map((g) => status(admin.setGroupClosed(g, true))))
    await admin.setGroupClosed(2, false)
    await t.store.save('g1', 't05', { sheet: { d1: 3 } })
    await t.round()
    const s = await srv.store.getScore('g1', 't05')
    record('W07', 'Close category: tablet edit reverted to server copy, API 423, bad group 400; reopen lets scoring continue',
      local?.sheet.d1 === 2 && direct === '423 group_closed' && badGroup.every((x) => x === '400 bad_group') && s?.sheet.d1 === 3,
      { tabletAfterCloseEdit: local?.sheet.d1, direct, badGroup, afterReopen: s?.sheet.d1 })
    await srv.close()
  }, 30_000)

  it('W08 reset in the middle of the event', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets.slice(0, 4), varied)
    const off = tablets[4]
    for (const team of TEAMS.slice(0, 2)) {
      await off.store.save('g5', team.id, { sheet: all(3) })
      await off.store.save('g5', team.id, { status: 'submitted' })
    }
    const typo = await raw(srv.base, 'POST', '/admin/reset', '{"confirm":"reset"}', admin.token)
    await admin.resetEventData()
    for (const t of tablets) await t.round()
    const left = await Promise.all(tablets.map((t) => t.store.listForJudge(t.judgeId)))
    record('W08', 'Reset mid-event: server and every tablet (incl. unsynced sheets) are wiped; the server keeps an archive copy', 'info', {
      confirmTypo: typo, serverScoresAfter: (await srv.store.listScores()).length, tabletRecordsAfter: left.map((l) => l.length),
      auditAfter: (await srv.store.listAudit()).map((a) => a.action), note: 'Since this PR the server archives scores, ties, deliberation and change log before a reset (recoverable by hand); sheets a tablet never sent are still lost',
    })
    await srv.close()
  }, 60_000)

  it('W09 a judge is absent: can the result still be locked?', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets.slice(0, 4), varied)
    const st = await admin.state()
    const ranks = applyOrder(proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st.scores)))), EMPTY_DELIBERATION).ranks
    const before = await status(admin.putDeliberation(lock(ranks, EMPTY_DELIBERATION)))
    await admin.setJudgeAbsent('g5', true)
    const after = await pickTiesAndLock(admin)
    record('W09', 'One judge absent (80 of 100 sheets): Mark absent lets the 4-judge panel decide ties and lock', before === '409 not_all_in' && after.lock === 200, { submitted: st.scores.length, lockBeforeMarkAbsent: before, tiesOfferedToPanelOf4: after.ties, lockAfter: after.lock })
    await srv.close()
  }, 60_000)

  it('W10 operator correction and a judge save at the same moment', async () => {
    const { srv, admin, tablets } = await setup()
    const t = tablets[0]
    await t.api.saveScore({ teamId: 't07', sheet: all(2), note: '', status: 'draft', version: 1 })
    let lost = 0
    for (let i = 0; i < 20; i++) {
      const v = 2 + i
      await Promise.allSettled([
        admin.correctScore('g1', 't07', { sheet: all(4), note: 'op', status: 'draft' }, 'race'),
        t.api.saveScore({ teamId: 't07', sheet: all(1), note: '', status: 'draft', version: (await srv.store.getScore('g1', 't07'))!.version + 1 }),
      ])
      const s = await srv.store.getScore('g1', 't07')
      // The correction must win (it has the higher version) or the judge's save must be refused.
      if (s?.note !== 'op' && s!.version < 1000 * (i + 1)) lost++
      void v
    }
    record('W10', 'Simultaneous correction + judge save: no write lost (version check is not atomic)', lost === 0, { racesTried: 20, correctionsOverwritten: lost, note: 'Get-then-put without a condition; DynamoDB has the same window' })
    await srv.close()
  }, 60_000)

  it('W11 backup tablet: same judge on two tablets editing the same sheet', async () => {
    const { srv } = await setup()
    const a = await Tablet.login(srv.base, '111111')
    const b = await Tablet.login(srv.base, '111111')
    for (const k of CRITERIA) await a.store.save('g1', 't04', { sheet: { [k]: 2 } })
    await a.round()
    await b.round()
    await a.store.save('g1', 't04', { sheet: { d1: 1 } })
    await b.store.save('g1', 't04', { sheet: { d1: 4 } })
    await a.round()
    await b.round()
    await a.round()
    const s = await srv.store.getScore('g1', 't04')
    const [la, lb] = await Promise.all([a.store.get('g1', 't04'), b.store.get('g1', 't04')])
    record('W11', 'Two tablets for one judge: all copies end equal (the later tap is lost silently)', s?.sheet.d1 === la?.sheet.d1 && la?.sheet.d1 === lb?.sheet.d1 ? 'info' : false,
      { server: s?.sheet.d1, tabletA: la?.sheet.d1, tabletB: lb?.sheet.d1 })
    await srv.close()
  }, 30_000)

  it('W12 judge submits a team that has not presented yet', async () => {
    const { srv, admin, tablets } = await setup()
    await admin.putRunOrder({ current: 't01' })
    const early = await status(tablets[0].api.saveScore({ teamId: 't20', sheet: all(4), note: '', status: 'submitted', version: 1 }))
    record('W12', 'Server accepts a submitted sheet for a team that has not been on stage yet', early !== 200 ? true : 'info', {
      submitTeam20WhileTeam1OnStage: early, note: 'Judges can open any team from the list; the sheet shows no "On stage" tag. A mistaken early submit is frozen until deliberation.',
    })
    await srv.close()
  }, 30_000)

  it('W13 judge management: rename, category swap moves tie ownership, limits', async () => {
    const { srv, admin, tablets } = await setup()
    const empty = await status(admin.updateJudge('g1', { name: '   ' }))
    const long = await admin.updateJudge('g1', { name: 'x'.repeat(80) }).then((j) => j.name.length)
    const swap = await admin.updateJudge('g1', { group: 2 })
    const st = await admin.state()
    const g2 = st.judges.find((j) => j.id === 'g2')
    await tablets[0].round()
    const unknown = await status(admin.updateJudge('g9', { name: 'x' }))
    const badGroup = await status(admin.updateJudge('g1', { group: 7 }))
    record('W13', 'Edit judge: blank name refused, long name cut to 60, category swap is mutual and reaches the tablet',
      empty === '400 bad_name' && long === 60 && swap.group === 2 && g2?.group === 1 && tablets[0].last?.judge?.group === 2 && unknown === '404 not_found' && badGroup === '400 bad_group',
      { empty, long, g1Group: swap.group, g2Group: g2?.group, tabletSeesNewGroup: tablets[0].last?.judge?.group, unknown, badGroup })
    await srv.close()
  }, 30_000)

  it('W14 load: 5 tablets + operator + 2 stage screens for 60 s of fast tapping under the 50/100 throttle', async () => {
    const { srv, admin, tablets } = await setup({ latency: 80, rate: 50, burst: 100 })
    tablets.forEach((t) => t.start())
    let screenFails = 0
    const op = setInterval(() => void Promise.all([admin.state(), admin.audit()]).catch(() => screenFails++), 3000)
    const stage = [1, 2].map(() => setInterval(() => void fetch(`${srv.base}/stage`).then((r) => r.ok || screenFails++).catch(() => screenFails++), 1000))
    const t0 = Date.now()
    await Promise.all(tablets.map(async (t, j) => {
      for (const team of TEAMS.slice(0, 3)) {
        for (const k of CRITERIA) {
          await sleep(300 + Math.random() * 900)
          await t.tap(team.id, { sheet: { [k]: varied(j, team.id)[k] } })
        }
        await t.tap(team.id, { status: 'submitted' })
      }
    }))
    let waiting = 1
    for (let i = 0; i < 40 && waiting; i++) {
      await sleep(250)
      waiting = (await Promise.all(tablets.map((t) => t.unsynced()))).reduce((a, b) => a + b, 0)
    }
    tablets.forEach((t) => t.stop())
    clearInterval(op)
    stage.forEach(clearInterval)
    const secs = (Date.now() - t0) / 1000
    const submitted = (await srv.store.listScores()).filter((s) => s.status === 'submitted').length
    record('W14', 'Load: fast tapping on 5 tablets with 2 stage screens; no 429, no Offline flicker, all sheets in', srv.stats.throttled === 0 && submitted === 15 && waiting === 0 && tablets.every((t) => t.offlineRounds === 0) && screenFails === 0,
      { seconds: Math.round(secs), requests: srv.stats.total, rps: +(srv.stats.total / secs).toFixed(1), peak: Math.max(...srv.stats.perSecond.values()), throttled: srv.stats.throttled, offlineRounds: tablets.reduce((a, t) => a + t.offlineRounds, 0), screenFails, submitted })
    await srv.close()
  }, 120_000)

  it('W15 deliberation scores change after a tie pick: pick only applies while that tie stands', async () => {
    const { srv, admin, tablets } = await setup()
    const pick = (j: number, teamId: string) => (teamId === 't09' || teamId === 't10' ? all(4) : { ...varied(j, teamId), d1: 1 } as ScoreSheet)
    await scoreAll(tablets, pick)
    await tablets[2].api.pickTieWinner('environment', 't10')
    await admin.putRunOrder({ deliberation: true })
    // Judge 4 lowers t10 during deliberation: the tie is gone, t09 wins on score.
    await tablets[3].store.save('g4', 't10', { sheet: { d1: 3 } })
    await tablets[3].store.save('g4', 't10', { status: 'submitted' })
    await tablets[3].round()
    const st = await admin.state()
    const s = rankCategory('environment', TEAMS, submittedSheets(st.scores), st.tieBreaks?.environment?.teamId)
    record('W15', 'A tie pick stops applying when deliberation edits break the tie', s.ranked[0].team.id === 't09' && s.pick === null && st.ties.every((t) => t.category !== 'environment'),
      { winner: s.ranked[0].team.id, pickStillApplies: s.pick, tiesNow: st.ties.map((t) => t.category) })
    await srv.close()
  }, 60_000)

  it('W17 a judge leaves after 10 teams: their sheets stop counting, the panel of 4 finishes the event', async () => {
    const { srv, admin, tablets } = await setup()
    const g5 = tablets[4]
    for (const team of TEAMS.slice(0, 10)) {
      await g5.store.save('g5', team.id, { sheet: varied(4, team.id) })
      await g5.store.save('g5', team.id, { status: 'submitted' })
    }
    await g5.round()
    await admin.setJudgeAbsent('g5', true)
    await scoreAll(tablets.slice(0, 4), varied)
    await g5.round()
    const st = await admin.state()
    const late = await status(g5.api.saveScore({ teamId: 't11', sheet: all(4), note: '', status: 'submitted', version: 1 }))
    const correction = await status(admin.correctScore('g5', 't11', { sheet: all(4), note: '', status: 'submitted' }, 'x'))
    const l = (await pickTiesAndLock(admin)).lock
    const back = await status(admin.setJudgeAbsent('g5', false))
    record('W17', 'Judge leaves mid-event: their 10 sheets leave the averages, tablet told, saves refused, lock works; cannot be undone after lock',
      st.judges.length === 4 && st.scores.every((x) => x.judgeId !== 'g5') && g5.last?.absent === true && late === '423 absent' && correction === '409 absent' && l === 200 && back === '423 locked',
      { panel: st.judges.map((j) => j.id), absent: st.absentJudges?.map((j) => j.id), tabletTold: g5.last?.absent, lateSave: late, correction, lock: l, bringBackAfterLock: back })
    await srv.close()
  }, 60_000)

  it('W16 normalizeRunOrder survives a corrupted stored running order', () => {
    const r = normalizeRunOrder({ order: ['t03', 't03', 'bad'], current: 'nope', startedAt: 'yesterday', pausedMs: -5, reached: 99 } as never)
    record('W16', 'Corrupted running order record is repaired (20 teams, no current, no timer)', r.order.length === 20 && r.current === null && r.startedAt === null && r.pausedMs === 0 && (r.reached ?? 0) <= 4, r)
  })
})
