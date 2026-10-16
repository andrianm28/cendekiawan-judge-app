import { describe, expect, it } from 'vitest'
import { announcementOrder, exactFinal, proposeRanks, rankCategory } from './ranking'
import type { ScoreSheet } from './scoring'
import { CATEGORIES, TEAMS } from './teams'

const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({ d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4], v1: v[0], v2: v[1], v3: v[2], v4: v[3] }) as ScoreSheet

const WARIS = sheet([3, 3, 3, 4, 3], [4, 3, 3, 2]) // 78
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
      ['t03', 78],
      ['t01', 59],
    ])
    expect(s.missing.map((t) => t.id)).toEqual(['t04'])
    expect(s.tiedAtTop).toBe(false)
  })

  it('leaves an equal final at the top to the category judge, even when D1 differs', () => {
    // Both 78; A has D1=4, B has D1=3.
    const a = sheet([4, 3, 3, 3, 3], [4, 3, 3, 2])
    const b = sheet([3, 3, 3, 4, 3], [4, 3, 3, 2])
    const scores = new Map([['t05', [b]], ['t06', [a]], ['t07', [KELAS]]])
    const s = rankCategory('health', TEAMS, scores)
    expect(s.tiedAtTop).toBe(true)
    expect(s.tiedTop.map((r) => r.team.id)).toEqual(['t06', 't05'])
    expect(s.pick).toBeNull()

    const picked = rankCategory('health', TEAMS, scores, 't05')
    expect(picked.ranked.map((r) => r.team.id)).toEqual(['t05', 't06', 't07'])
    expect(picked.tiedAtTop).toBe(false)
    expect(picked.pick).toBe('t05')

    // A pick outside the tied teams does nothing.
    expect(rankCategory('health', TEAMS, scores, 't07').tiedAtTop).toBe(true)
  })

  it('ranks by the unrounded average, so two teams both showing 77 are not a tie', () => {
    // Four judges each. Level sums: t06 25+25+25+24 = 99 → 77.34, t05 25+25+24+24 = 98 → 76.56; both round to 77.
    const ALL3 = sheet([3, 3, 3, 3, 3], [3, 3, 3, 3]) // 24 → 75
    const scores = new Map([
      ['t05', [WARIS, WARIS, ALL3, ALL3]],
      ['t06', [WARIS, WARIS, WARIS, ALL3]],
    ])
    const s = rankCategory('health', TEAMS, scores)
    expect(s.ranked.map((r) => [r.team.id, r.final, exactFinal(r)])).toEqual([
      ['t06', 77, '77.34'],
      ['t05', 77, '76.56'],
    ])
    expect(s.tiedAtTop).toBe(false)
  })

  it('averages every judge before comparing', () => {
    const s = rankCategory('health', TEAMS, new Map([['t05', [WARIS, KELAS]], ['t06', [WARIS, WARIS]]]))
    expect(s.ranked.map((r) => [r.team.id, r.final, r.judges])).toEqual([['t06', 78, 2], ['t05', 69, 2]])
    expect(s.tiedAtTop).toBe(false)
  })
})

describe('proposeRanks', () => {
  it('orders the five category winners by final and maps the awards', () => {
    const finals: Record<string, ScoreSheet> = {
      t01: WARIS, // education 78
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
      [3, 'Rank 3', 't01', 78],
      [4, 'Emerging Innovator', 't13', 75],
      [5, 'Rising Innovator', 't09', 59],
    ])
    expect(announcementOrder(ranks).map((r) => r.award)[0]).toBe('Rising Innovator')
  })

  it('flags winners with the same final as a tie, even when D1 or D4 differ', () => {
    // Both 78; the education winner has the higher D1, so it is listed first, but it is still a tie.
    const scores = new Map([
      ['t01', [sheet([4, 3, 3, 3, 3], [4, 3, 3, 2])]],
      ['t05', [WARIS]],
    ])
    const ranks = proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, scores)))
    expect(ranks.map((r) => [r.winner.team.id, r.winner.final, r.tiedWithAbove])).toEqual([
      ['t01', 78, false],
      ['t05', 78, true],
    ])
  })
})
