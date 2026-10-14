import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ScoreStore } from './scoreStore'

let n = 0
const fresh = () => ScoreStore.open(`test-${n++}`)

describe('ScoreStore', () => {
  it('saves each tap as a merged draft and bumps the version', async () => {
    const store = await fresh()
    await store.save('g1', 't01', { sheet: { d1: 3 } })
    const r = await store.save('g1', 't01', { sheet: { v1: 4 } })
    expect(r.sheet).toEqual({ d1: 3, v1: 4 })
    expect(r.status).toBe('draft')
    expect(r.version).toBe(2)
    expect(r.synced).toBe(false)
  })

  it('keeps the note and sheet when only the status changes', async () => {
    const store = await fresh()
    await store.save('g1', 't01', { sheet: { d1: 2 }, note: 'Clear pitch' })
    const r = await store.save('g1', 't01', { status: 'submitted' })
    expect(r).toMatchObject({ sheet: { d1: 2 }, note: 'Clear pitch', status: 'submitted' })
  })

  it('separates judges', async () => {
    const store = await fresh()
    await store.save('g1', 't01', { sheet: { d1: 1 } })
    await store.save('g2', 't05', { sheet: { d1: 4 } })
    expect((await store.listForJudge('g1')).map((r) => r.teamId)).toEqual(['t01'])
    expect(await store.listAll()).toHaveLength(2)
  })

  it('keeps the deliberation state', async () => {
    const store = await fresh()
    expect((await store.getDeliberation()).order).toEqual([])
    await store.saveDeliberation({ order: ['t05'], log: [], lockedAt: null })
    expect((await store.getDeliberation()).order).toEqual(['t05'])
  })
})
