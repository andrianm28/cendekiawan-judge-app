// Final UAT (18 Oct 2026): out-of-the-box scenarios the 15 and 16 Oct runs did not cover,
// from worst case to ideal, against the real API handler and the real tablet sync code.
//   npm run sim -- final-uat        (writes sim/final-uat.json, or SIM_OUT)
// Like full-uat, each scenario records PASS / FAIL / INFO with its evidence.

import { writeFileSync } from 'node:fs'
import { afterAll, describe, it } from 'vitest'
import { signToken } from '../../api/src/auth'
import { applyOrder, EMPTY_DELIBERATION, lock, moveRank } from '../src/domain/deliberation'
import { resultsCsv, scoresCsv } from '../src/domain/exportCsv'
import { compareResults, proposeRanks, rankCategory, teamResult } from '../src/domain/ranking'
import { stepCurrent, timerClock, elapsedSeconds, showFinished } from '../src/domain/runOrder'
import { averagedFinal, CRITERIA, finalScaled, FINAL_SCALE, type Level, type ScoreSheet } from '../src/domain/scoring'
import { CATEGORIES, TEAMS } from '../src/domain/teams'
import { submittedSheets } from '../src/domain/ties'
import { Api, ApiError } from '../src/sync/api'
import { syncJudge } from '../src/sync/sync'
import { sleep, startServer, Tablet } from './harness'

type Result = 'PASS' | 'FAIL' | 'INFO'
const OUT = process.env.SIM_OUT ?? 'sim/final-uat.json'
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

async function scoreAll(tablets: Tablet[], pick: (j: number, teamId: string) => ScoreSheet, teams = TEAMS) {
  for (const [j, t] of tablets.entries()) {
    for (const team of teams) {
      await t.store.save(t.judgeId, team.id, { sheet: pick(j, team.id) })
      await t.store.save(t.judgeId, team.id, { status: 'submitted' })
    }
    await t.round()
  }
}

const varied = (j: number, teamId: string): ScoreSheet => {
  const n = Number(teamId.slice(1))
  return sheetOf(CRITERIA.map((_, i) => (1 + ((n * 7 + i * 3 + j * 5 + ((n * i) % 3)) % 4)) as Level))
}

const ranksOf = async (admin: Api) => {
  const st = await admin.state()
  return applyOrder(proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st.scores), st.tieBreaks?.[c.id]?.teamId))), st.deliberation ?? EMPTY_DELIBERATION).ranks
}

/** Exact half-up rounding of a non-negative fraction, by BigInt. */
const exactRound = (num: bigint, den: bigint) => Number((2n * num + den) / (2n * den))

describe('final UAT', () => {
  it('F01 one mis-tap on "On stage" for a team in a later category locks out the categories in between', async () => {
    const { srv, admin } = await setup()
    await admin.putRunOrder({ current: 't01' })
    // The operator meant t02 but tapped the On stage button on t20's row (GovTech, last block).
    const jump = await status(admin.putRunOrder({ current: 't20' }))
    const back = await status(admin.putRunOrder({ current: 't05' }))
    const toEdu = await status(admin.putRunOrder({ current: 't02' }))
    const r = (await admin.state()).runOrder
    record('F01', 'Jumping to a later category skips the categories between and the server never lets them back on stage (only a full Reset undoes it)',
      'info', { jumpToTeam20: jump, healthTeamAfter: back, educationTeamAfter: toEdu, reached: r.reached,
        note: 'Server rule is by design (ADR: no going back). The risk is that the per-row On stage button in the running order asked no confirmation. Fixed in the UI: it now names the categories it would skip and needs a confirm.' })
    await srv.close()
  }, 30_000)

  it('F02 drag-reordering the current category can make a team never be put on stage', async () => {
    const { srv, admin } = await setup()
    await admin.putRunOrder({ current: 't01' })
    let run = await admin.putRunOrder(stepCurrent((await admin.state()).runOrder, 1))
    // t02 on stage; the operator drags t04 above t02 (into a slot that already went by).
    const order = run.order.filter((id) => id !== 't04')
    order.splice(1, 0, 't04')
    run = await admin.putRunOrder({ order })
    const seen = new Set(['t01', 't02'])
    for (let i = 0; i < 3; i++) {
      run = await admin.putRunOrder(stepCurrent(run, 1))
      if (run.current) seen.add(run.current)
    }
    const edu = TEAMS.filter((t) => t.category === 'education').map((t) => t.id)
    const skipped = edu.filter((id) => !seen.has(id))
    record('F02', 'Reordering teams that already passed in the current category: Next walks on and a team is silently skipped', 'info',
      { orderAfterDrag: order.slice(0, 4), onStageSequence: [...seen], skippedTeams: skipped,
        note: 'Fixed in the UI: leaving a category now warns by name about any team in it that was never on stage (from the change log).' })
    await srv.close()
  }, 30_000)

  it('F03 operator correction body with extra fields', async () => {
    const { srv, admin } = await setup()
    await srv.service.saveScore({ role: 'judge', sub: 'g2', exp: 9e9 }, 't01', { sheet: all(2), note: 'mine', status: 'draft', version: 1 })
    const body = JSON.stringify({ sheet: all(4), note: 'op', status: 'submitted', reason: 'paper sheet', judgeId: 'g2', teamId: 't01', version: 5, updatedAt: 'x' })
    const res = await raw(srv.base, 'PUT', '/admin/scores/g1/t01', body, admin.token)
    const g1 = await srv.store.getScore('g1', 't01')
    const g2 = await srv.store.getScore('g2', 't01')
    const audit = (await srv.store.listAudit()).find((a) => a.action === 'correct_score')
    const ok = res.startsWith('200') && g1?.note === 'op' && g2?.note === 'mine' && !('reason' in (g1 ?? {}))
    record('F03', 'A correction for judge 1 writes only judge 1\'s sheet, whatever else the body holds, and stores no stray fields', ok,
      { res, g1: g1 && { note: g1.note, version: g1.version, keys: Object.keys(g1) }, g2: g2 && { note: g2.note, version: g2.version }, auditJudge: audit?.detail.judgeId })
    await srv.close()
  }, 30_000)

  it('F04 operator presses Reset while a tablet is half-way through a sync round', async () => {
    const { srv, admin, tablets } = await setup()
    const t = tablets[0]
    // A rehearsal sheet still on the tablet (not yet sent).
    await t.store.save('g1', 't03', { sheet: all(1), note: 'rehearsal' })
    const real = t.api
    // The round reads /state (old epoch), then the operator resets, then it uploads.
    const racy = Object.assign(Object.create(Object.getPrototypeOf(real)), real, {
      state: async () => { const s = await real.state(); await admin.resetEventData(); return s },
    }) as Api
    await syncJudge(racy, t.store, 'g1')
    const leaked = await srv.store.getScore('g1', 't03')
    await t.round()
    const after = await srv.store.getScore('g1', 't03')
    const local = await t.store.get('g1', 't03')
    record('F04', 'A rehearsal sheet uploaded in the same second as Reset does not land in the fresh event data', !leaked && !after && !local,
      { serverRightAfterRace: leaked && { note: leaked.note }, serverAfterNextRound: after && { note: after.note }, tabletAfter: local && { note: local.note } })
    await srv.close()
  }, 30_000)

  it('F05 stage link shared: 15 phones poll the public stage route (deployed limit 10/s, burst 20)', async () => {
    const srv = await startServer({ latency: 30, rate: 10, burst: 20 })
    const base = srv.base
    let ledOk = 0, ledFail = 0, maxGap = 0, lastOk = Date.now()
    const stop = Date.now() + 20_000
    const poll = async (led: boolean) => {
      while (Date.now() < stop) {
        const r = await fetch(`${base}/stage`).catch(() => null)
        if (led) {
          if (r?.ok) { ledOk++; maxGap = Math.max(maxGap, Date.now() - lastOk); lastOk = Date.now() } else ledFail++
        }
        await sleep(1000)
      }
    }
    await Promise.all([poll(true), ...Array.from({ length: 15 }, () => poll(false))])
    record('F05', 'LED stage screen keeps updating when 15 extra viewers open the public stage link', ledOk / (ledOk + ledFail) > 0.5 ? 'info' : false, {
      ledRequests: ledOk + ledFail, ledAnswered: ledOk, ledThrottled: ledFail, longestGapMs: maxGap, throttledTotal: srv.stats.throttled,
      note: 'The screen keeps its last state and the timer keeps counting locally, showing "Reconnecting…" while throttled. Keep the stage link off public channels.',
    })
    await srv.close()
  }, 60_000)

  it('F06 someone at the venue types 20 wrong PINs: a judge whose tablet logged out cannot log back in', async () => {
    const { srv, tablets } = await setup()
    for (let i = 0; i < 20; i++) await status(new Api(srv.base).login(String(400000 + i)))
    const judge = await status(new Api(srv.base).login('333333'))
    const loggedIn = await status(tablets[0].api.state())
    const op = await status(new Api(srv.base).login(ADMIN))
    const judgeAfterOp = await status(new Api(srv.base).login('333333'))
    record('F06', 'Wrong-PIN pause: blocks a real judge for 15 min; logged-in tablets unaffected; operator login lifts the pause at once',
      judge === '429 too_many_tries' && loggedIn === 200 && op === 200 && judgeAfterOp === 200, { judge, loggedIn, operatorLogin: op, judgeAfterOperatorLogin: judgeAfterOp })
    await srv.close()
  }, 30_000)

  it('F07 averaging maths: 30,000 random panels of 2-5 judges against exact fractions', () => {
    let seed = 20261020
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const sheet = () => sheetOf(CRITERIA.map(() => (1 + Math.floor(rnd() * 4)) as Level))
    let bad = 0, cmpBad = 0, n = 0
    for (let i = 0; i < 30_000; i++) {
      const k = 2 + Math.floor(rnd() * 4)
      const a = Array.from({ length: k }, sheet)
      const kb = 2 + Math.floor(rnd() * 4)
      const b = Array.from({ length: kb }, sheet)
      const sumA = BigInt(a.reduce((s, x) => s + finalScaled(x), 0))
      const sumB = BigInt(b.reduce((s, x) => s + finalScaled(x), 0))
      if (averagedFinal(a) !== exactRound(sumA, BigInt(FINAL_SCALE * k))) bad++
      // Exact comparison of sumA/k vs sumB/kb.
      const exact = Math.sign(Number(sumB * BigInt(k) - sumA * BigInt(kb)))
      const got = Math.sign(compareResults(teamResult(TEAMS[0], a), teamResult(TEAMS[1], b)))
      if (exact !== 0 && exact !== got) cmpBad++
      n++
    }
    record('F07', 'Averaged final = exact half-up of the true average; ranking order matches exact fractions (mixed panel sizes)', bad === 0 && cmpBad === 0, { panels: n, roundingErrors: bad, orderErrors: cmpBad })
  })

  it('F08 extreme ties: four identical teams in a category and five identical winners', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets, () => all(3))
    const st = await admin.state()
    const pickTried = await status(tablets[0].api.pickTieWinner('education', 't03'))
    for (const t of (await admin.state()).ties) if (t.category !== 'education') await admin.pickTieWinner(t.category, t.tied[t.tied.length - 1].teamId)
    const st2 = await admin.state()
    const proposed = proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, submittedSheets(st2.scores), st2.tieBreaks?.[c.id]?.teamId)))
    // Every winner equals every other: any order is allowed; move Rank 5 all the way to Rank 1.
    let d = EMPTY_DELIBERATION
    for (let from = 5; from > 1; from--) d = moveRank(applyOrder(proposed, d).ranks, d, from, from - 1, 'Judges agreed after discussion')
    const save = await status(admin.putDeliberation(d))
    const locked = await status(admin.putDeliberation(lock(applyOrder(proposed, d).ranks, d)))
    const finalOrder = (await admin.state()).deliberation?.order
    record('F08', 'All 20 teams equal: 5 ties offered to their owners (4 teams each), all picks taken, winners freely reordered with reasons, lock OK',
      st.ties.length === 5 && st.ties.every((t) => t.tied.length === 4) && pickTried === 200 && save === 200 && locked === 200,
      { tiesOffered: st.ties.length, teamsPerTie: st.ties.map((t) => t.tied.length), ownerPick: pickTried, saveReorder: save, lock: locked, finalOrder })
    await srv.close()
  }, 60_000)

  it('F09 the owner judge is absent when their category ties', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets.slice(1), (j, id) => (TEAMS.find((t) => t.id === id)!.category === 'education' ? all(3) : varied(j, id)))
    await admin.setJudgeAbsent('g1', true)
    const judgeView = (await tablets[0].api.state()).ties
    const judgePick = await status(tablets[0].api.pickTieWinner('education', 't02'))
    const opPick = await status(admin.pickTieWinner('education', 't01'))
    record('F09', 'Absent owner: tie hidden from their tablet, their pick refused, the operator records it (PR #17, merged into this branch)',
      judgeView.length === 0 && judgePick === '423 absent' && opPick === 200, { tiesOnAbsentTablet: judgeView.length, absentJudgePick: judgePick, operatorPick: opPick })
    await srv.close()
  }, 60_000)

  it('F10 owner picks a tie, then the operator swaps categories between two judges', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets, (j, id) => (TEAMS.find((t) => t.id === id)!.category === 'health' ? all(2) : varied(j, id)))
    const p1 = await status(tablets[1].api.pickTieWinner('health', 't06'))
    await admin.updateJudge('g2', { group: 3 })
    const oldOwner = await status(tablets[1].api.pickTieWinner('health', 't07'))
    const newOwnerSees = (await tablets[2].api.state()).ties.map((t) => t.category)
    const newOwner = await status(tablets[2].api.pickTieWinner('health', 't07'))
    const pick = (await admin.state()).tieBreaks?.health
    record('F10', 'Category swap moves tie ownership at once: the old owner is refused, the new owner sees and can change the pick',
      p1 === 200 && oldOwner === '403 forbidden' && newOwnerSees.includes('health') && newOwner === 200 && pick?.teamId === 't07' && pick.by === 'g3',
      { firstPick: p1, oldOwner, newOwnerSees, newOwner, pick })
    await srv.close()
  }, 60_000)

  it('F11 after Lock nothing can move the result', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets, varied)
    for (const t of (await admin.state()).ties) await admin.pickTieWinner(t.category, t.tied[0].teamId)
    const ranks = await ranksOf(admin)
    await admin.putDeliberation(lock(ranks, EMPTY_DELIBERATION))
    const before = JSON.stringify((await ranksOf(admin)).map((r) => r.winner.team.id))
    const tries = {
      judgeSave: await status(tablets[0].api.saveScore({ teamId: 't01', sheet: all(4), note: '', status: 'submitted', version: 99 })),
      correction: await status(admin.correctScore('g1', 't01', { sheet: all(4), note: '', status: 'submitted' }, 'late')),
      tiePick: await status(admin.pickTieWinner('education', 't01')),
      absent: await status(admin.setJudgeAbsent('g2', true)),
      reorder: await status(admin.putDeliberation({ ...EMPTY_DELIBERATION, order: [...ranks].reverse().map((r) => r.winner.team.id) })),
      openDeliberationThenSave: await (async () => { await admin.putRunOrder({ deliberation: true }); return status(tablets[1].api.saveScore({ teamId: 't02', sheet: all(1), note: '', status: 'draft', version: 99 })) })(),
      resetWithPlainWord: await status(admin.resetEventData('RESET')),
    }
    const after = JSON.stringify((await ranksOf(admin)).map((r) => r.winner.team.id))
    record('F11', 'Locked: judge save, correction, tie pick, absent, reorder, deliberation reopen and plain RESET are all refused; result unchanged',
      tries.judgeSave === '423 locked' && tries.correction === '423 locked' && tries.tiePick === '423 locked' && tries.absent === '423 locked' && tries.reorder === '423 locked'
      && tries.openDeliberationThenSave === '423 locked' && tries.resetWithPlainWord === '400 confirm_required' && before === after, { ...tries, unchanged: before === after })
    await srv.close()
  }, 60_000)

  it('F12 deliberation: a judge taps a submitted sheet and walks away', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets, varied)
    for (const t of (await admin.state()).ties) await admin.pickTieWinner(t.category, t.tied[0].teamId)
    await admin.putRunOrder({ deliberation: true })
    await tablets[3].tap('t11', { sheet: { d1: 1 }, status: 'draft' })
    await sleep(200)
    const ranks = await ranksOf(admin)
    const lockTry = await status(admin.putDeliberation(lock(ranks, EMPTY_DELIBERATION)))
    const cur = await srv.store.getScore('g4', 't11')
    await admin.correctScore('g4', 't11', { sheet: cur!.sheet, note: cur!.note, status: 'submitted' }, 'Judge confirmed verbally')
    const ranks2 = await ranksOf(admin)
    const lock2 = await status(admin.putDeliberation(lock(ranks2, EMPTY_DELIBERATION)))
    record('F12', 'A sheet left as draft blocks Lock (not_all_in); the operator submits it with a reason and Lock goes through',
      lockTry === '409 not_all_in' && lock2 === 200, { draftLeft: cur?.status, firstLock: lockTry, afterCorrection: lock2 })
    await srv.close()
  }, 60_000)

  it('F13 another judge logs in on a tablet that still holds unsent sheets', async () => {
    const { srv } = await setup({ ...fast })
    const a = await Tablet.login(srv.base, '111111')
    srv.cfg.mode = 'down'
    await a.store.save('g1', 't01', { sheet: all(3) })
    await a.store.save('g1', 't01', { status: 'submitted' })
    await a.round()
    srv.cfg.mode = 'up'
    // Judge 1 logs out; judge 2 uses the same tablet (same IndexedDB).
    const s2 = await new Api(srv.base).login('222222')
    const r2 = await syncJudge(new Api(srv.base, s2.token), a.store, 'g2')
    const g1BeforeBack = await srv.store.getScore('g1', 't01')
    const s1 = await new Api(srv.base).login('111111')
    const r1 = await syncJudge(new Api(srv.base, s1.token), a.store, 'g1')
    const g1After = await srv.store.getScore('g1', 't01')
    record('F13', 'Shared tablet: judge 2 never uploads judge 1\'s sheets; they go up when judge 1 logs in again there',
      !g1BeforeBack && g1After?.status === 'submitted' && r2.waiting === 0 && r1.waiting === 0, { judge2Round: { waiting: r2.waiting }, g1BeforeBack: !!g1BeforeBack, g1After: g1After?.status })
    await srv.close()
  }, 30_000)

  it('F14 two operator screens (laptop + phone), one of them stale', async () => {
    const { srv, admin } = await setup()
    await admin.putRunOrder({ current: 't01' })
    const stale = (await admin.state()).runOrder
    // Laptop double-clicks Next: both requests computed from the same state.
    await Promise.all([admin.putRunOrder(stepCurrent(stale, 1)), admin.putRunOrder(stepCurrent(stale, 1))])
    const afterDouble = (await admin.state()).runOrder.current
    // Laptop moves on to t03; the phone, still showing t01, presses Next.
    await admin.putRunOrder({ current: 't03' })
    await admin.putRunOrder(stepCurrent(stale, 1))
    const afterStale = (await admin.state()).runOrder.current
    record('F14', 'Double Next from one screen advances once; a stale second screen can step the stage back inside the category', afterDouble === 't02' ? 'info' : false,
      { afterDoubleClick: afterDouble, afterStalePhoneNext: afterStale, note: 'Run the stage from one screen only; the phone is for watching.' })
    await srv.close()
  }, 30_000)

  it('F15 hostile payloads and paths', async () => {
    const { srv, admin, tablets } = await setup()
    const j = tablets[0].api.token!
    const b = srv.base
    const put = (body: string, path = '/scores/t01') => raw(b, 'PUT', path, body, j)
    const ev = {
      protoKey: await put('{"sheet":{"__proto__":{"d1":3}},"note":"","status":"draft","version":1}'),
      constructorKey: await put('{"sheet":{"constructor":3},"note":"","status":"draft","version":2}'),
      levelFloat4: await put('{"sheet":{"d1":4.0},"note":"","status":"draft","version":3}'),
      versionNegative: await put('{"sheet":{},"note":"","status":"draft","version":-1}'),
      versionHuge: await put('{"sheet":{},"note":"","status":"draft","version":1000000001}'),
      noteNull: await put('{"sheet":{},"note":null,"status":"draft","version":4}'),
      body1MB: await put(JSON.stringify({ sheet: {}, note: 'x'.repeat(1_000_000), status: 'draft', version: 5 })),
      emojiNote200: await put(JSON.stringify({ sheet: {}, note: '🙂'.repeat(100), status: 'draft', version: 6 })),
      dotdot: await put('{}', '/scores/../admin/reset'),
      encoded: await put('{"sheet":{},"note":"","status":"draft","version":7}', '/scores/%74%30%32'),
      extraSegment: await put('{}', '/scores/t01/x'),
      trailingSlashState: await raw(b, 'GET', '/state/', undefined, j),
      unknownMethod: await raw(b, 'DELETE', '/scores/t01', undefined, j),
      adminJudgeSubToken: await raw(b, 'PUT', '/scores/t01', '{"sheet":{},"note":"","status":"draft","version":8}', signToken({ role: 'judge', sub: 'admin', exp: 9e9 }, SECRET)),
      adminTokenNoKey: await raw(b, 'GET', '/admin/audit', undefined, signToken({ role: 'admin', sub: 'admin', exp: 9e9 }, SECRET)),
      healthy: await status(admin.state()),
    }
    const proto = await srv.store.getScore('g1', 't01')
    const no500 = Object.entries(ev).filter(([, v]) => typeof v === 'string' && v.startsWith('5'))
    record('F15', 'Hostile bodies, prototype keys, encoded and traversal paths: no 500, nothing stored outside the rules, server stays healthy',
      no500.length === 0 && ev.protoKey.startsWith('400') && ev.versionNegative.startsWith('400') && ev.versionHuge.startsWith('400') && ev.dotdot.startsWith('404') && ev.adminTokenNoKey === '401 unauthorized' && ev.healthy === 200,
      { ...ev, storedT01: proto && Object.keys(proto.sheet), answered5xx: no500 })
    await srv.close()
  }, 60_000)

  it('F16 Wi-Fi flaps every 1.5 s for 45 s while all five judges score', async () => {
    const { srv, tablets } = await setup({ latency: 40, rate: 50, burst: 100 })
    tablets.forEach((t) => t.start(3000))
    let up = true
    const flap = setInterval(() => { up = !up; srv.cfg.mode = up ? 'up' : 'down' }, 1500)
    const end = Date.now() + 45_000
    let taps = 0
    while (Date.now() < end) {
      await Promise.all(tablets.map((t, j) => {
        const team = TEAMS[taps % TEAMS.length]
        return t.store.save(t.judgeId, team.id, { sheet: { [CRITERIA[taps % 8]]: (1 + ((taps + j) % 4)) as Level } })
      }))
      taps++
      await sleep(300)
    }
    clearInterval(flap)
    srv.cfg.mode = 'up'
    for (let i = 0; i < 3; i++) for (const t of tablets) await t.round()
    tablets.forEach((t) => t.stop())
    let mismatch = 0
    for (const t of tablets) {
      for (const r of await t.store.listForJudge(t.judgeId)) {
        const s = await srv.store.getScore(t.judgeId, r.teamId)
        if (!s || JSON.stringify(s.sheet) !== JSON.stringify(r.sheet) || !r.synced) mismatch++
      }
    }
    record('F16', 'Flapping Wi-Fi: after it settles every tablet copy equals the server copy, nothing left waiting', mismatch === 0,
      { tapsPerTablet: taps, mismatches: mismatch, unsynced: await Promise.all(tablets.map((t) => t.unsynced())), offlineRounds: tablets.map((t) => t.offlineRounds) })
    await srv.close()
  }, 120_000)

  it('F17 closed category while a tablet is offline with drafts, then reopened before it returns', async () => {
    const { srv, admin, tablets } = await setup()
    const t = tablets[2]
    await t.store.save('g3', 't09', { sheet: { d1: 4 } })
    await t.round()
    srv.cfg.mode = 'down'
    await t.store.save('g3', 't09', { sheet: { d2: 4 } })
    srv.cfg.mode = 'up'
    await admin.setGroupClosed(3, true)
    await admin.setGroupClosed(3, false)
    srv.cfg.mode = 'down'
    await t.round()
    srv.cfg.mode = 'up'
    await t.round()
    const s = await srv.store.getScore('g3', 't09')
    record('F17', 'Close then reopen while the tablet was away: its offline taps still reach the server', s?.sheet.d2 === 4 && s.sheet.d1 === 4, { server: s?.sheet })
    await srv.close()
  }, 30_000)

  it('F18 operator flips a judge absent and back during scoring', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets, varied, TEAMS.slice(0, 8))
    const s1 = await admin.state()
    for (let i = 0; i < 5; i++) {
      await admin.setJudgeAbsent('g4', true)
      await admin.setJudgeAbsent('g4', false)
    }
    const s2 = await admin.state()
    const same = JSON.stringify(s1.scores.map((x) => [x.judgeId, x.teamId, x.version]).sort()) === JSON.stringify(s2.scores.map((x) => [x.judgeId, x.teamId, x.version]).sort())
    const third = await (async () => { await admin.setJudgeAbsent('g1', true); await admin.setJudgeAbsent('g2', true); await admin.setJudgeAbsent('g3', true); return status(admin.setJudgeAbsent('g4', true)) })()
    record('F18', 'Absent on/off repeatedly loses no sheet; the panel never drops below 2', same && third === '409 panel_too_small', { sheetsUnchanged: same, fourthAbsent: third })
    await srv.close()
  }, 60_000)

  it('F19 deliberation forgery from a second device or a handcrafted request', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets, varied)
    for (const t of (await admin.state()).ties) await admin.pickTieWinner(t.category, t.tied[0].teamId)
    const ranks = await ranksOf(admin)
    const ids = ranks.map((r) => r.winner.team.id)
    const ev = {
      blankReason: await status(admin.putDeliberation({ order: ids, log: [{ at: '', teamId: ids[0], from: 1, to: 2, reason: '  ' }], lockedAt: null })),
      breakScoreOrder: await status(admin.putDeliberation({ order: [...ids].reverse(), log: [{ at: '', teamId: ids[4], from: 5, to: 1, reason: 'we like it' }], lockedAt: null })),
      lockWrongSet: await status(admin.putDeliberation({ order: [...ids.slice(0, 4), 't20' === ids[4] ? 't19' : 't20'], log: [], lockedAt: 'now' })),
      orderNotArray: await raw(srv.base, 'PUT', '/admin/deliberation', '{"order":"x","log":[]}', admin.token),
      goodSave: await status(admin.putDeliberation({ order: ids, log: [{ at: '', teamId: ids[0], from: 1, to: 1, reason: 'confirmed' }], lockedAt: null })),
      staleSecondDevice: await status(admin.putDeliberation({ order: ids, log: [], lockedAt: null })),
    }
    record('F19', 'Blank reason 400, reordering non-tied winners 409, locking a wrong set 409, older log from a second device 409',
      ev.blankReason === '400 reason_required' && ev.breakScoreOrder === '409 not_tied' && String(ev.lockWrongSet).startsWith('409') && ev.orderNotArray.startsWith('400') && ev.goodSave === 200 && ev.staleSecondDevice === '409 stale', ev)
    await srv.close()
  }, 60_000)

  it('F20 Reset archive with the heaviest realistic data', async () => {
    const { srv, admin, tablets } = await setup()
    await scoreAll(tablets, varied)
    for (const t of tablets) for (const team of TEAMS) await srv.store.putScore({ ...(await srv.store.getScore(t.judgeId, team.id))!, note: 'n'.repeat(200) })
    for (let i = 0; i < 3000; i++) await srv.store.appendAudit({ at: new Date().toISOString(), actor: 'admin', action: 'now_presenting', detail: { teamId: TEAMS[i % 20].id } })
    const r = await status(admin.resetEventData('RESET'))
    const left = (await srv.store.listScores()).length
    record('F20', 'Reset with 100 full sheets, 200-char notes and 3,000 log entries: archived under the item limit and wiped', r === 200 && left === 0, { reset: r, scoresLeft: left })
    await srv.close()
  }, 120_000)

  it('F21 exports: CSV opens cleanly with tricky notes and names', () => {
    const team = TEAMS[0]
    const csv = scoresCsv([
      { team, judgeName: 'Mr. Aizek Zulkifli', sheet: all(4), note: '=HYPERLINK("http://x","click")', status: 'submitted', updatedAt: 'now' },
      { team, judgeName: 'Dr. "Q", Jr.', sheet: all(1), note: 'line1\nline2, with comma', status: 'submitted', updatedAt: 'now' },
      { team, judgeName: 'محمد 🙂', sheet: { d1: 3 }, note: '+60 12-345', status: 'draft', updatedAt: 'now' },
    ])
    const formulaSafe = !/(^|,)[=+\-@]/m.test(csv.split('\r\n').slice(1).join('\r\n').replace(/"[^"]*"/g, '""'))
    const res = resultsCsv([])
    record('F21', 'Scores CSV: formulas neutralised, quotes/commas/newlines escaped, Unicode intact; results CSV has its header',
      formulaSafe && csv.includes("'=HYPERLINK") && csv.includes('"Dr. ""Q"", Jr."') && csv.includes('محمد 🙂') && res.startsWith('Rank,Award'), { sample: csv.split('\r\n')[1] })
  })

  it('F22 timer: pause, operator laptop reload, resume, and wildly wrong tablet clocks', async () => {
    const { srv, admin } = await setup()
    await admin.putRunOrder({ current: 't01', timer: 'start' })
    await sleep(1100)
    await admin.putRunOrder({ timer: 'pause' })
    await sleep(1500)
    const reloaded = (await new Api(srv.base, admin.token).state()).runOrder
    await admin.putRunOrder({ timer: 'resume' })
    await sleep(1000)
    const r = (await admin.state()).runOrder
    const now = Date.now()
    const right = elapsedSeconds(timerClock(r, 0)!, now)
    // A tablet whose clock is 3 h ahead, and one stuck in 2016: both get the server offset.
    const ahead = elapsedSeconds(timerClock(r, -3 * 3600_000)!, now + 3 * 3600_000)
    const behind = elapsedSeconds(timerClock(r, 10 * 365 * 86400_000)!, now - 10 * 365 * 86400_000)
    record('F22', 'Pause survives a reload; elapsed excludes the pause; tablets with a wrong clock show the same time',
      !!reloaded.pausedAt && right === 2 && ahead === right && behind === right, { pausedAfterReload: !!reloaded.pausedAt, elapsed: right, clockAhead3h: ahead, clock10yBehind: behind })
    await srv.close()
  }, 30_000)

  it('F23 the end of the show and stepping past it', async () => {
    const { srv, admin } = await setup()
    let run = (await admin.state()).runOrder
    const seen: (string | null)[] = []
    for (let i = 0; i < 22; i++) {
      run = await admin.putRunOrder(stepCurrent(run, 1))
      seen.push(run.current)
    }
    record('F23', 'Next 22 times from the start: 20 teams in order, then the stage clears and stays cleared (show finished)',
      seen.slice(0, 20).join() === run.order.join() && seen[20] === null && seen[21] === null && showFinished(run), { last: seen.slice(18), finished: showFinished(run) })
    await srv.close()
  }, 30_000)

  it('F24 ideal day, end to end, at deployed throttle and latency', async () => {
    const { srv, admin, tablets } = await setup({ latency: 80, rate: 50, burst: 100 })
    tablets.forEach((t) => t.start(3000))
    let run = (await admin.state()).runOrder
    const lag: number[] = []
    for (let i = 0; i < 20; i++) {
      run = await admin.putRunOrder({ ...stepCurrent(run, 1) })
      run = await admin.putRunOrder({ timer: 'start' })
      const team = run.current!
      await Promise.all(tablets.map(async (t, j) => {
        for (const k of CRITERIA) await t.tap(team, { sheet: { [k]: varied(j, team)[k] } })
        await t.tap(team, { status: 'submitted' })
      }))
      const t0 = Date.now()
      while ((await srv.store.listScores()).filter((s) => s.teamId === team && s.status === 'submitted').length < 5 && Date.now() - t0 < 15_000) await sleep(100)
      lag.push(Date.now() - t0)
    }
    run = await admin.putRunOrder(stepCurrent(run, 1))
    tablets.forEach((t) => t.stop())
    const st = await admin.state()
    for (const t of st.ties) await admin.pickTieWinner(t.category, t.tied[0].teamId)
    const ranks = await ranksOf(admin)
    const lockR = await status(admin.putDeliberation(lock(ranks, EMPTY_DELIBERATION)))
    const csv = scoresCsv((await admin.state()).scores.map((s) => ({ team: TEAMS.find((t) => t.id === s.teamId)!, judgeName: s.judgeId, sheet: s.sheet, note: s.note, status: s.status, updatedAt: s.updatedAt })))
    record('F24', 'Ideal day: 20 teams by Next, 5 tablets, 100 submitted sheets, ties picked, lock OK, CSV 101 lines; worst wait for all 5 sheets',
      st.scores.length === 100 && st.scores.every((s) => s.status === 'submitted') && lockR === 200 && csv.trim().split('\r\n').length === 101 && showFinished(run) && srv.stats.throttled === 0,
      { sheets: st.scores.length, ties: st.ties.length, lock: lockR, worstMsUntilAll5In: Math.max(...lag), throttled: srv.stats.throttled, requests: srv.stats.total, mc: ranks.map((r) => `${r.rank} ${r.winner.team.appName}`) })
    await srv.close()
  }, 300_000)
})
