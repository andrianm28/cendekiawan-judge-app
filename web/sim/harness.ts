// Worst-case simulation harness: the real API handler behind an HTTP server that
// behaves like API Gateway (throttle, latency, dropped or hung connections), and simulated
// tablets that run the real tablet sync code against it.

import 'fake-indexeddb/auto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { makeHandler } from '../../api/src/handler'
import { hashPin } from '../../api/src/auth'
import { JudgingService } from '../../api/src/service'
import { memoryStore, type Store } from '../../api/src/store'
import { CRITERIA } from '../src/domain/scoring'
import { JUDGES } from '../src/judges'
import { ScoreStore } from '../src/storage/scoreStore'
import { Api } from '../src/sync/api'
import { syncJudge, type SyncResult } from '../src/sync/sync'

export interface Net {
  /** Added to every request, ms. */
  latency: number
  /** 'up', 'down' (connection reset), 'hang' (accepts, never answers). */
  mode: 'up' | 'down' | 'hang'
  rate: number
  burst: number
}

export interface Stats {
  total: number
  throttled: number
  byPath: Record<string, number>
  perSecond: Map<number, number>
}

export async function startServer(net: Partial<Net> = {}) {
  const cfg: Net = { latency: 60, mode: 'up', rate: Number(process.env.SIM_RATE ?? 50), burst: Number(process.env.SIM_BURST ?? 100), ...net }
  const secret = 'sim-secret-sim-secret-sim-secret-sim!'
  const store: Store = memoryStore()
  await store.putJudges(JUDGES.map((j) => ({ ...j, pinHash: hashPin(String(j.group).repeat(6)) })))
  await store.putAdminPinHash(hashPin('99999999'))
  const service = new JudgingService(store, secret)
  const handle = makeHandler(service, secret)
  const stats: Stats = { total: 0, throttled: 0, byPath: {}, perSecond: new Map() }
  let tokens = cfg.burst
  let last = Date.now()
  const hung: (() => void)[] = []

  const server: Server = createServer(async (req, res) => {
    if (cfg.mode === 'down') return req.socket.destroy()
    if (cfg.mode === 'hang') return void hung.push(() => req.socket.destroy())
    const now = Date.now()
    tokens = Math.min(cfg.burst, tokens + ((now - last) / 1000) * cfg.rate)
    last = now
    stats.total++
    const sec = Math.floor(now / 1000)
    stats.perSecond.set(sec, (stats.perSecond.get(sec) ?? 0) + 1)
    const key = `${req.method} ${(req.url ?? '').split('/').slice(0, 2).join('/')}`
    stats.byPath[key] = (stats.byPath[key] ?? 0) + 1
    if (tokens < 1) {
      stats.throttled++
      res.writeHead(429, { 'content-type': 'application/json' })
      return res.end('{"message":"Too Many Requests"}')
    }
    tokens -= 1
    let body = ''
    for await (const chunk of req) body += chunk
    await new Promise((r) => setTimeout(r, cfg.latency))
    const r = (await handle({
      requestContext: { http: { method: req.method ?? 'GET' } } as never,
      rawPath: new URL(req.url ?? '/', 'http://x').pathname,
      headers: { authorization: req.headers.authorization ?? '' },
      body: body || undefined,
    })) as { statusCode: number; headers?: Record<string, string>; body?: string }
    res.writeHead(r.statusCode, r.headers)
    res.end(r.body ?? '')
  })
  await new Promise<void>((r) => server.listen(0, r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    base, cfg, stats, store, service,
    release: () => hung.splice(0).forEach((f) => f()),
    close: () => new Promise<void>((r) => { hung.splice(0).forEach((f) => f()); server.close(() => r()) }),
  }
}

let dbN = 0

/** One judge tablet, driving the same sync code and the same 3-second loop as JudgeApp. */
export class Tablet {
  api!: Api
  store!: ScoreStore
  judgeId!: string
  last: SyncResult | null = null
  running = false
  rounds = 0
  offlineRounds = 0
  private timer?: ReturnType<typeof setInterval>
  stuckSince: number | null = null

  static async login(base: string, pin: string) {
    const t = new Tablet()
    const s = await new Api(base).login(pin)
    t.api = new Api(base, s.token)
    t.judgeId = s.judge!.id
    t.store = await ScoreStore.open(`sim-${dbN++}`)
    return t
  }

  async round() {
    if (this.running) return
    this.running = true
    this.stuckSince = Date.now()
    try {
      const r = await syncJudge(this.api, this.store, this.judgeId)
      this.rounds++
      if (!r.online) this.offlineRounds++
      this.last = r
    } finally {
      this.running = false
      this.stuckSince = null
    }
  }

  start(every = 3000) {
    void this.round()
    this.timer = setInterval(() => void this.round(), every)
  }

  stop() {
    clearInterval(this.timer)
  }

  /** A tap: save on the tablet, then kick a sync round (as ScoreForm.onChange does). */
  async tap(teamId: string, change: Parameters<ScoreStore['save']>[2]) {
    await this.store.save(this.judgeId, teamId, change)
    void this.round()
  }

  async unsynced() {
    return (await this.store.listForJudge(this.judgeId)).filter((r) => !r.synced).length
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const CRITS = CRITERIA
