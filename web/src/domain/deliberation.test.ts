import { describe, expect, it } from 'vitest'
import { applyOrder, canSwap, EMPTY_DELIBERATION, keepsScoreOrder, lock, moveRank } from './deliberation'
import { proposeRanks, rankCategory } from './ranking'
import type { ScoreSheet } from './scoring'
import { CATEGORIES, TEAMS } from './teams'

const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({ d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4], v1: v[0], v2: v[1], v3: v[2], v4: v[3] }) as ScoreSheet

const proposal = (extra: Record<string, ScoreSheet> = {}) => {
  const base: Record<string, ScoreSheet> = {
    t01: sheet([3, 3, 3, 4, 2], [4, 3, 3, 2]), // 77
    t05: sheet([4, 3, 3, 4, 3], [4, 3, 3, 3]), // 84
    t09: sheet([3, 2, 2, 3, 2], [3, 2, 2, 2]), // 59
    t13: sheet([3, 3, 3, 3, 3], [3, 3, 3, 3]), // 75
    t17: sheet([4, 4, 4, 4, 4], [4, 4, 4, 4]), // 100
    ...extra,
  }
  const scores = new Map(Object.entries(base).map(([k, v]) => [k, [v]]))
  return proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, scores)))
}

const now = new Date('2026-10-20T12:20:00Z')

describe('deliberation', () => {
  it('starts from the proposal', () => {
    const { ranks, stale } = applyOrder(proposal(), EMPTY_DELIBERATION)
    expect(ranks.map((r) => r.winner.team.id)).toEqual(['t17', 't05', 't01', 't13', 't09'])
    expect(stale).toBe(false)
  })

  // t01 scores exactly what t05 scores, so the two winners are tied at Rank 2–3.
  const tied = () => proposal({ t01: sheet([4, 3, 3, 4, 3], [4, 3, 3, 3]) })

  it('swaps exactly tied winners, re-labels awards, and logs the reason', () => {
    const p = tied()
    const { ranks } = applyOrder(p, EMPTY_DELIBERATION)
    expect(ranks.map((r) => r.winner.team.id)).toEqual(['t17', 't01', 't05', 't13', 't09'])
    const d = moveRank(ranks, EMPTY_DELIBERATION, 3, 2, 'Clearer impact', now)
    const after = applyOrder(p, d).ranks
    expect(after.map((r) => [r.winner.team.id, r.award, r.proposedRank])).toEqual([
      ['t17', 'Winner of AWS CendekiAwan', 1],
      ['t05', 'Rank 2', 3],
      ['t01', 'Rank 3', 2],
      ['t13', 'Emerging Innovator', 4],
      ['t09', 'Rising Innovator', 5],
    ])
    expect(d.log).toEqual([{ at: now.toISOString(), teamId: 't05', from: 3, to: 2, reason: 'Clearer impact' }])
  })

  it('refuses to reorder winners whose averages differ', () => {
    const { ranks } = applyOrder(tied(), EMPTY_DELIBERATION)
    expect(canSwap(ranks, 2, 1)).toBe(false)
    expect(canSwap(ranks, 3, 1)).toBe(false)
    expect(() => moveRank(ranks, EMPTY_DELIBERATION, 2, 1, 'Strongest pitch')).toThrow(/same average/)
    expect(() => moveRank(ranks, EMPTY_DELIBERATION, 4, 3, 'Strongest pitch')).toThrow(/same average/)
  })

  it('lets the server refuse an order that puts a lower average above a higher one', () => {
    const p = tied()
    expect(keepsScoreOrder(p, ['t17', 't05', 't01', 't13', 't09'])).toBe(true)
    expect(keepsScoreOrder(p, ['t05', 't17', 't01', 't13', 't09'])).toBe(false)
    expect(keepsScoreOrder(p, ['t17', 't01', 't05', 't09', 't13'])).toBe(false)
  })

  it('requires a reason', () => {
    const { ranks } = applyOrder(proposal(), EMPTY_DELIBERATION)
    expect(() => moveRank(ranks, EMPTY_DELIBERATION, 2, 1, '  ')).toThrow(/reason/)
  })

  it('refuses changes after lock', () => {
    const { ranks } = applyOrder(proposal(), EMPTY_DELIBERATION)
    const d = lock(ranks, EMPTY_DELIBERATION, now)
    expect(d.lockedAt).toBe(now.toISOString())
    expect(() => moveRank(ranks, d, 2, 1, 'late change')).toThrow(/locked/)
  })

  it('falls back to the proposal when a late score changes a category winner', () => {
    const { ranks } = applyOrder(tied(), EMPTY_DELIBERATION)
    const d = moveRank(ranks, EMPTY_DELIBERATION, 3, 2, 'reason', now)
    // A late score makes t10 the environment winner instead of t09.
    const late = proposal({ t01: sheet([4, 3, 3, 4, 3], [4, 3, 3, 3]), t10: sheet([4, 4, 4, 4, 4], [4, 4, 4, 3]) })
    const r = applyOrder(late, d)
    expect(r.stale).toBe(true)
    expect(r.ranks.map((x) => x.winner.team.id)).toEqual(late.map((x) => x.winner.team.id))
  })
})
