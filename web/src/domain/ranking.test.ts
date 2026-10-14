import { describe, expect, it } from 'vitest'
import { announcementOrder, proposeRanks, rankCategory } from './ranking'
import type { ScoreSheet } from './scoring'
import { CATEGORIES, TEAMS } from './teams'

const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({ d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4], v1: v[0], v2: v[1], v3: v[2], v4: v[3] }) as ScoreSheet

const WARIS = sheet([3, 3, 3, 4, 2], [4, 3, 3, 2]) // 77
const KELAS = sheet([3, 2, 2, 3, 2], [3, 2, 2, 2]) // 59
const HEALTH = sheet([4, 3, 3, 4, 3], [4, 3, 3, 3]) // 84

describe('rankCategory', () => {
  it('ranks by final and lists unscored teams', () => {
    const scores = new Map([
      ['t01', [KELAS]],
      ['t02', [HEALTH]],
      ['t03', [WARIS]],
    ])
    const s = rankCategory('education', TEAMS, scores)
    expect(s.ranked.map((r) => [r.team.id, r.final])).toEqual([
      ['t02', 84],
      ['t03', 77],
      ['t01', 59],
    ])
    expect(s.missing.map((t) => t.id)).toEqual(['t04'])
    expect(s.tiedAtTop).toBe(false)
  })

  it('breaks an equal final on D1, then D4', () => {
    // Both 77 after rounding; A has D1=4, B has D1=3.
    const a = sheet([4, 3, 3, 3, 2], [4, 3, 3, 2])
    const b = sheet([3, 3, 3, 4, 2], [4, 3, 3, 2])
    const s = rankCategory('health', TEAMS, new Map([['t05', [b]], ['t06', [a]]]))
    expect(s.ranked[0].final).toBe(s.ranked[1].final)
    expect(s.ranked[0].team.id).toBe('t06')
    expect(s.tiedAtTop).toBe(false)

    // Same D1, D4 decides.
    const c = sheet([3, 3, 3, 4, 2], [4, 3, 3, 2])
    const d = sheet([3, 3, 4, 3, 2], [4, 3, 3, 2])
    const s2 = rankCategory('health', TEAMS, new Map([['t05', [d]], ['t06', [c]]]))
    expect(s2.ranked[0].team.id).toBe('t06')
  })

  it('flags a tie the rules cannot break', () => {
    const s = rankCategory('health', TEAMS, new Map([['t05', [WARIS]], ['t06', [WARIS]]]))
    expect(s.tiedAtTop).toBe(true)
  })
})

describe('proposeRanks', () => {
  it('orders the five category winners by final and maps the awards', () => {
    const finals: Record<string, ScoreSheet> = {
      t01: WARIS, // education 77
      t05: HEALTH, // health 84
      t09: KELAS, // environment 59
      t13: sheet([3, 3, 3, 3, 3], [3, 3, 3, 3]), // finance 75
      t17: sheet([4, 4, 4, 4, 4], [4, 4, 4, 4]), // govtech 100
    }
    const scores = new Map(Object.entries(finals).map(([k, v]) => [k, [v]]))
    const standings = CATEGORIES.map((c) => rankCategory(c.id, TEAMS, scores))
    const ranks = proposeRanks(standings)
    expect(ranks.map((r) => [r.rank, r.award, r.winner.team.id, r.winner.final])).toEqual([
      [1, 'Winner of AWS CendekiAwan', 't17', 100],
      [2, 'Rank 2', 't05', 84],
      [3, 'Rank 3', 't01', 77],
      [4, 'Emerging Innovator', 't13', 75],
      [5, 'Rising Innovator', 't09', 59],
    ])
    expect(announcementOrder(ranks).map((r) => r.award)[0]).toBe('Rising Innovator')
  })
})
