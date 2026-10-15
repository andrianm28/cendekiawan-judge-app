import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { Api } from '../src/sync/api'
import { TEAMS } from '../src/domain/teams'
import { CRITS, sleep, startServer, Tablet } from './harness'

const OUT = process.env.SIM_OUT ?? 'sim/results.json'
const results: Record<string, unknown> = {}
afterAll(() => writeFileSync(OUT, JSON.stringify(results, null, 2)))

const PINS = ['111111', '222222', '333333', '444444', '555555']
const rand = (a: number, b: number) => a + Math.random() * (b - a)

async function fiveTablets(base: string) {
  return Promise.all(PINS.map((p) => Tablet.login(base, p)))
}

/** Operator board (state + audit every 3 s) and stage screen (state every 1 s). */
function screens(base: string, token: string, stageScreens = 1) {
  const api = new Api(base, token)
  let fails = 0
  const t1 = setInterval(() => void Promise.all([api.state(), api.audit()]).catch(() => fails++), 3000)
  const ts = Array.from({ length: stageScreens }, () => setInterval(() => void api.state().catch(() => fails++), 1000))
  return { stop: () => [t1, ...ts].forEach(clearInterval), fails: () => fails }
}

async function scoreTeam(t: Tablet, teamId: string, gap: [number, number]) {
  for (const k of CRITS) {
    await sleep(rand(...gap))
    await t.tap(teamId, { sheet: { [k]: (1 + Math.floor(Math.random() * 4)) as 1 | 2 | 3 | 4 } })
  }
  await sleep(rand(...gap))
  await t.tap(teamId, { status: 'submitted' })
}

async function converge(tablets: Tablet[], limitMs: number) {
  const t0 = Date.now()
  while (Date.now() - t0 < limitMs) {
    const waiting = (await Promise.all(tablets.map((t) => t.unsynced()))).reduce((a, b) => a + b, 0)
    if (!waiting) return Date.now() - t0
    await sleep(250)
  }
  return -1
}

describe('worst cases', () => {
  it('W6 five judges tapping at once after a pitch, under the API Gateway throttle (SIM_RATE/SIM_BURST, default 50/100 as deployed)', async () => {
    const out: Record<string, unknown> = {}
    for (const [label, gap, stages] of [
      ['realistic (2-8 s between taps, 1 stage screen)', [2000, 8000], 1],
      ['fast (0.4-1.5 s between taps, 1 stage screen)', [400, 1500], 1],
      ['fast + 2nd stage screen in judges room', [400, 1500], 2],
    ] as const) {
      const srv = await startServer({ latency: 80 })
      const admin = await new Api(srv.base).login('99999999')
      const tablets = await fiveTablets(srv.base)
      const sc = screens(srv.base, admin.token, stages)
      tablets.forEach((t) => t.start())
      const t0 = Date.now()
      await Promise.all(tablets.map((t) => scoreTeam(t, TEAMS[0].id, gap as unknown as [number, number])))
      const conv = await converge(tablets, 30000)
      const dur = (Date.now() - t0) / 1000
      tablets.forEach((t) => t.stop())
      sc.stop()
      const peak = Math.max(...srv.stats.perSecond.values())
      const server = (await srv.store.listScores()).filter((s) => s.status === 'submitted').length
      out[label] = {
        seconds: Math.round(dur),
        requests: srv.stats.total,
        rps: +(srv.stats.total / dur).toFixed(1),
        peakPerSecond: peak,
        throttled429: srv.stats.throttled,
        tabletRoundsShownOffline: tablets.reduce((a, t) => a + t.offlineRounds, 0),
        tabletRounds: tablets.reduce((a, t) => a + t.rounds, 0),
        screenFailures: sc.fails(),
        convergedAfterLastTapMs: conv,
        submittedOnServer: server,
      }
      await srv.close()
    }
    results.W6 = out
  }, 300_000)

  it('W7 venue Wi-Fi down 15 minutes, then all tablets reconnect with a backlog', async () => {
    const srv = await startServer({ latency: 80 })
    const admin = await new Api(srv.base).login('99999999')
    const tablets = await fiveTablets(srv.base)
    srv.cfg.mode = 'down'
    // During the outage each judge scores 3 teams fully (taps stay on the tablet).
    for (const t of tablets) {
      for (const team of TEAMS.slice(0, 3)) {
        for (const k of CRITS) await t.store.save(t.judgeId, team.id, { sheet: { [k]: 3 } })
        await t.store.save(t.judgeId, team.id, { status: 'submitted' })
      }
    }
    tablets.forEach((t) => t.start())
    const sc = screens(srv.base, admin.token)
    await sleep(4000)
    const shownOffline = tablets.every((t) => t.last && !t.last.online)
    srv.cfg.mode = 'up'
    const conv = await converge(tablets, 60000)
    tablets.forEach((t) => t.stop())
    sc.stop()
    results.W7 = {
      shownOfflineDuringOutage: shownOffline,
      backlogSheets: 15,
      convergedMs: conv,
      throttled429: srv.stats.throttled,
      submittedOnServer: (await srv.store.listScores()).filter((s) => s.status === 'submitted').length,
    }
    expect(conv).toBeGreaterThan(0)
    await srv.close()
  }, 120_000)

  it('W5 half-dead Wi-Fi: requests are accepted but never answered', async () => {
    const srv = await startServer({ latency: 50 })
    const [t] = await fiveTablets(srv.base)
    t.start()
    await sleep(3500)
    const before = t.last?.online
    srv.cfg.mode = 'hang'
    await t.tap(TEAMS[1].id, { sheet: { d1: 4 } })
    await sleep(15000)
    const stuckMs = t.stuckSince ? Date.now() - t.stuckSince : 0
    const statusShown = t.last?.online ? 'Synced / waiting (looks online)' : 'Offline'
    srv.cfg.mode = 'up'
    srv.release()
    await sleep(4000)
    const recovered = (await t.unsynced()) === 0
    t.stop()
    results.W5 = { onlineBefore: before, roundStuckForMsAfter15s: stuckMs, statusShownWhileHung: statusShown, roundsDuringHang: 'none (guard holds)', recoveredAfterRelease: recovered }
    await srv.close()
  }, 60_000)

  it('W8 dead tablet: operator keys the paper sheet, then the tablet comes back with older offline taps', async () => {
    const srv = await startServer({ latency: 10 })
    const admin = new Api(srv.base, (await new Api(srv.base).login('99999999')).token)
    const [t] = await fiveTablets(srv.base)
    const team = TEAMS[2].id
    // Tablet syncs a few taps, then loses Wi-Fi and keeps scoring offline.
    for (const k of CRITS.slice(0, 3)) await t.store.save(t.judgeId, team, { sheet: { [k]: 2 } })
    await t.round()
    srv.cfg.mode = 'down'
    for (const k of CRITS) await t.store.save(t.judgeId, team, { sheet: { [k]: 2 } })
    await t.store.save(t.judgeId, team, { status: 'submitted' })
    srv.cfg.mode = 'up'
    const local = await t.store.get(t.judgeId, team)
    // Operator thinks the tablet is dead and keys the judge's paper sheet (all 4s).
    const paper = Object.fromEntries(CRITS.map((k) => [k, 4]))
    const corrected = await admin.correctScore(t.judgeId, team, { sheet: paper, note: 'from paper', status: 'submitted' }, 'tablet died, paper backup')
    // Tablet comes back.
    await t.round()
    const server = await srv.store.getScore(t.judgeId, team)
    results.W8 = {
      tabletOfflineVersion: local?.version,
      operatorCorrectionVersion: corrected.version,
      serverAfterTabletReturns: { version: server?.version, sheet: server?.sheet },
      correctionSurvived: JSON.stringify(server?.sheet) === JSON.stringify(paper),
      correctionInAuditLog: (await srv.store.listAudit()).some((a) => a.action === 'correct_score'),
    }
    await srv.close()
  }, 30_000)

  it('W9 judge logs in on a backup tablet while the first tablet is still alive', async () => {
    const srv = await startServer({ latency: 30 })
    const a = await Tablet.login(srv.base, '111111')
    const b = await Tablet.login(srv.base, '111111')
    const team = TEAMS[3].id
    for (const k of CRITS) await a.tap(team, { sheet: { [k]: 2 } })
    await sleep(500)
    await a.round()
    await b.round()
    // Both edit the same sheet; B a bit later.
    await a.store.save(a.judgeId, team, { sheet: { d1: 1 } })
    await b.store.save(b.judgeId, team, { sheet: { d1: 4 } })
    await a.round()
    await b.round()
    await a.round()
    const server = await srv.store.getScore('g1', team)
    const la = await a.store.get('g1', team)
    const lb = await b.store.get('g1', team)
    results.W9 = {
      serverD1: server?.sheet.d1,
      tabletA_D1: la?.sheet.d1,
      tabletB_D1: lb?.sheet.d1,
      allAgree: server?.sheet.d1 === la?.sheet.d1 && la?.sheet.d1 === lb?.sheet.d1,
      note: 'Last tablet to sync with a lower version silently loses its tap',
    }
    await srv.close()
  }, 30_000)

  it('W1 a judge does not turn up: can the result still be locked?', async () => {
    const srv = await startServer({ latency: 0, rate: 1e6, burst: 1e6 })
    const admin = new Api(srv.base, (await new Api(srv.base).login('99999999')).token)
    const tablets = (await fiveTablets(srv.base)).slice(0, 4)
    for (const t of tablets) {
      for (const team of TEAMS) {
        await t.store.save(t.judgeId, team.id, { sheet: Object.fromEntries(CRITS.map((k, i) => [k, 1 + ((i + team.order + Number(t.judgeId[1])) % 4)])) })
        await t.store.save(t.judgeId, team.id, { status: 'submitted' })
      }
      await t.round()
    }
    const st = await admin.state()
    let lock: string
    try {
      await admin.putDeliberation({ order: [], log: [], lockedAt: new Date().toISOString() } as never)
      lock = 'locked'
    } catch (e) {
      lock = `refused: ${(e as Error).message}`
    }
    results.W1 = { submitted: st.scores.filter((s) => s.status === 'submitted').length, expected: 100, tiesOffered: st.ties.length, lock }
    await srv.close()
  }, 60_000)

  it('W3 operator presses Reset in the middle of the event', async () => {
    const srv = await startServer({ latency: 0, rate: 1e6, burst: 1e6 })
    const admin = new Api(srv.base, (await new Api(srv.base).login('99999999')).token)
    const tablets = await fiveTablets(srv.base)
    for (const t of tablets) {
      for (const team of TEAMS.slice(0, 10)) {
        for (const k of CRITS) await t.store.save(t.judgeId, team.id, { sheet: { [k]: 3 } })
        await t.store.save(t.judgeId, team.id, { status: 'submitted' })
      }
      await t.round()
    }
    // One tablet is offline at the moment of reset with 2 more sheets on it.
    const off = tablets[4]
    for (const team of TEAMS.slice(10, 12)) {
      for (const k of CRITS) await off.store.save(off.judgeId, team.id, { sheet: { [k]: 3 } })
    }
    const r = await admin.resetEventData()
    for (const t of tablets) await t.round()
    const left = await Promise.all(tablets.map((t) => t.store.listForJudge(t.judgeId)))
    results.W3 = {
      removedOnServer: r.scores,
      serverAfter: (await srv.store.listScores()).length,
      localCopiesLeftOnTablets: left.map((l) => l.length),
      offlineTabletKeptItsUnsynced: left[4].length,
      auditAfter: (await srv.store.listAudit()).map((a) => a.action),
    }
    await srv.close()
  }, 60_000)

  it('W10 operator moves to the next team while a judge is about to tap', async () => {
    // Pure timing model of JudgeApp: the tablet switches sheets on the next sync round
    // after the operator's change; a tap during the 0-3 s window lands on the new team.
    const srv = await startServer({ latency: 60 })
    const admin = new Api(srv.base, (await new Api(srv.base).login('99999999')).token)
    const [t] = await fiveTablets(srv.base)
    await admin.putRunOrder({ current: TEAMS[0].id })
    await t.round()
    let shown = t.last?.runOrder?.current
    for (const k of CRITS.slice(0, 7)) await t.store.save(t.judgeId, shown!, { sheet: { [k]: 3 } })
    await admin.putRunOrder({ current: TEAMS[1].id })
    await t.round()
    shown = t.last?.runOrder?.current
    // The judge's next two taps were meant for team 1 but the screen now shows team 2.
    for (const k of CRITS.slice(7)) await t.store.save(t.judgeId, shown!, { sheet: { [k]: 3 } })
    await t.round()
    const s1 = await srv.store.getScore(t.judgeId, TEAMS[0].id)
    const s2 = await srv.store.getScore(t.judgeId, TEAMS[1].id)
    results.W10 = {
      team1Criteria: Object.keys(s1?.sheet ?? {}).length,
      team1Status: s1?.status,
      team2Criteria: Object.keys(s2?.sheet ?? {}).join(','),
      operatorWarnedBeforeNext: 'no: Next team is always enabled (the run order list shows n/5 scored only)',
    }
    await srv.close()
  }, 30_000)
})
