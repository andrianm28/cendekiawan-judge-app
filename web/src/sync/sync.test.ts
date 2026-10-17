import 'fake-indexeddb/auto'
import { DEFAULT_RUN_ORDER } from '../domain/runOrder'
import { describe, expect, it } from 'vitest'
import { ScoreStore } from '../storage/scoreStore'
import { ApiError, type Api, type ServerScore, type ServerState } from './api'
import { syncJudge } from './sync'

let n = 0
const fresh = () => ScoreStore.open(`sync-${n++}`)

/** A server with the same version rules as the real API, kept in memory. */
function fakeServer() {
  const scores = new Map<string, ServerScore>()
  const closed = new Set<number>()
  let up = true
  let epoch: string | null = null
  let lockedAt: string | null = null
  const api = {
    async saveScore(r: ServerScore) {
      if (!up) throw new TypeError('Failed to fetch')
      if (Object.keys(r.sheet).some((k) => k === 'v3')) throw new ApiError(400, 'bad_score', 'Invalid score sheet')
      if (r.teamId === 'nope') throw new ApiError(404, 'not_found', 'Unknown judge or team')
      if (closed.has(1) || lockedAt) throw new ApiError(423, closed.has(1) ? 'group_closed' : 'locked', 'closed')
      const cur = scores.get(r.teamId)
      if (cur && r.version <= cur.version) throw new ApiError(409, 'stale', 'stale', cur)
      const saved = { judgeId: 'g1', teamId: r.teamId, sheet: r.sheet, note: r.note, status: r.status, version: r.version, updatedAt: 'now' }
      scores.set(r.teamId, saved)
      return saved
    },
    async state(): Promise<ServerState> {
      if (!up) throw new TypeError('Failed to fetch')
      return { judges: [{ id: 'g1', group: 1, name: 'Mba Yashinta' }], closedGroups: [...closed], scores: [...scores.values()],
        runOrder: DEFAULT_RUN_ORDER, serverTime: new Date().toISOString(), ties: [], epoch, locked: !!lockedAt }
    },
  }
  const reset = () => {
    scores.clear()
    epoch = new Date().toISOString()
  }
  return { api: api as unknown as Api, scores, closed, reset, setUp: (v: boolean) => (up = v), lock: () => (lockedAt = 'now') }
}

describe('syncJudge', () => {
  it('uploads waiting sheets and marks them synced', async () => {
    const store = await fresh()
    const server = fakeServer()
    await store.save('g1', 't01', { sheet: { d1: 3 } })
    await store.save('g1', 't02', { sheet: { d1: 2 } })
    const r = await syncJudge(server.api, store, 'g1')
    expect(r).toMatchObject({ online: true, waiting: 0 })
    expect(server.scores.get('t01')?.sheet).toEqual({ d1: 3 })
    expect((await store.listForJudge('g1')).every((x) => x.synced)).toBe(true)
  })

  it('keeps taps on the tablet while offline and uploads them later', async () => {
    const store = await fresh()
    const server = fakeServer()
    server.setUp(false)
    await store.save('g1', 't01', { sheet: { d1: 3 } })
    await store.save('g1', 't01', { sheet: { v1: 4 } })
    expect(await syncJudge(server.api, store, 'g1')).toMatchObject({ online: false, waiting: 1 })
    server.setUp(true)
    expect(await syncJudge(server.api, store, 'g1')).toMatchObject({ online: true, waiting: 0 })
    expect(server.scores.get('t01')).toMatchObject({ sheet: { d1: 3, v1: 4 }, version: 2 })
  })

  it('takes an operator correction from the server', async () => {
    const store = await fresh()
    const server = fakeServer()
    await store.save('g1', 't01', { sheet: { d1: 3 } })
    await syncJudge(server.api, store, 'g1')
    server.scores.set('t01', { ...server.scores.get('t01')!, sheet: { d1: 4 }, version: 2 })
    const r = await syncJudge(server.api, store, 'g1')
    expect(r.replaced).toEqual(['t01'])
    expect((await store.get('g1', 't01'))?.sheet).toEqual({ d1: 4 })
    // the next tap continues from the server's version
    expect((await store.save('g1', 't01', { sheet: { d3: 1 } })).version).toBe(3)
  })

  it('drops unsent edits in a closed group in favour of the server copy', async () => {
    const store = await fresh()
    const server = fakeServer()
    await store.save('g1', 't01', { sheet: { d1: 3 } })
    await syncJudge(server.api, store, 'g1')
    server.closed.add(1)
    await store.save('g1', 't01', { sheet: { d1: 1 } })
    const r = await syncJudge(server.api, store, 'g1')
    expect(r).toMatchObject({ closedGroups: [1], waiting: 0 })
    expect((await store.get('g1', 't01'))?.sheet).toEqual({ d1: 3 })
  })

  it('treats every category as closed once the result is locked', async () => {
    const store = await fresh()
    const server = fakeServer()
    await store.save('g1', 't05', { sheet: { d1: 3 } })
    await syncJudge(server.api, store, 'g1')
    server.lock()
    await store.save('g1', 't05', { sheet: { d1: 1 } })
    const r = await syncJudge(server.api, store, 'g1')
    expect(r).toMatchObject({ closedGroups: [1, 2, 3, 4, 5], waiting: 0 })
    expect((await store.get('g1', 't05'))?.sheet).toEqual({ d1: 3 })
  })

  it('drops rehearsal records, even unsent ones, when the operator resets', async () => {
    const store = await fresh()
    const server = fakeServer()
    await store.save('g1', 't01', { sheet: { d1: 3 } })
    await syncJudge(server.api, store, 'g1')
    server.setUp(false)
    await store.save('g1', 't02', { sheet: { d1: 2 } })
    await syncJudge(server.api, store, 'g1')
    server.reset()
    server.setUp(true)
    const r = await syncJudge(server.api, store, 'g1')
    expect(r.reset).toBe(true)
    expect(await store.listAll()).toEqual([])
    expect(server.scores.size).toBe(0)
    // Scoring after the reset works as normal and is not dropped again.
    await store.save('g1', 't01', { sheet: { d1: 4 } })
    expect((await syncJudge(server.api, store, 'g1')).reset).toBe(false)
    expect(server.scores.get('t01')?.sheet).toEqual({ d1: 4 })
  })

  it('keeps syncing the other sheets when the server refuses one, and drops the old V3 criterion', async () => {
    const srv = fakeServer()
    const store = await fresh()
    await store.save('g1', 'nope', { sheet: { d1: 3 } })
    // A sheet from before the 8-criteria rubric, as a trial tablet may still hold it.
    await store.save('g1', 't01', { sheet: { d1: 3, v3: 2 } as never })
    await store.save('g1', 't02', { sheet: { d1: 4 } })
    const r = await syncJudge(srv.api, store, 'g1')
    expect(r.online).toBe(true)
    expect(r.rejected).toBe(1)
    expect(r.waiting).toBe(1)
    expect([...srv.scores.keys()].sort()).toEqual(['t01', 't02'])
    expect(srv.scores.get('t01')!.sheet).toEqual({ d1: 3 })
  })
})
