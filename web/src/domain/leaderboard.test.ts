import { describe, expect, it } from 'vitest'
import { buildLeaderboard, movements, type ScoreInput } from './leaderboard'
import type { ScoreSheet } from './scoring'

const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({ d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4], v1: v[0], v2: v[1], v3: v[2], v4: v[3] }) as ScoreSheet

const S77 = sheet([3, 3, 3, 4, 3], [4, 3, 3, 2])
const S62 = sheet([3, 2, 2, 3, 2], [3, 2, 2, 2])
const S87 = sheet([4, 3, 3, 4, 3], [4, 3, 3, 3])

const rec = (teamId: string, s: ScoreSheet, status: ScoreInput['status'] = 'submitted'): ScoreInput =>
  ({ teamId, judgeId: 'g', sheet: s, status })

describe('buildLeaderboard', () => {
  const records = [rec('t01', S62), rec('t02', S87), rec('t05', S77), rec('t09', S77, 'draft'), { ...rec('t13', S87), sheet: { d1: 4 as const } }]

  it('ranks submitted teams overall and per category, leaving the rest unscored', () => {
    const b = buildLeaderboard(records, { includeDrafts: false })
    expect(b.rows.map((r) => [r.result.team.id, r.overallRank, r.categoryRank, r.result.final])).toEqual([
      ['t02', 1, 1, 85],
      ['t05', 2, 1, 80],
      ['t01', 3, 2, 60],
    ])
    expect(b.unscored).toHaveLength(17)
    expect(b.submitted).toBe(3)
    expect(b.drafts).toBe(1) // the incomplete sheet is not counted
    expect(b.rows[0].award).toBe('Winner of AWS CendekiAwan')
    expect(b.rows[1].award).toBe('Rank 2')
    expect(b.rows[2].award).toBeUndefined()
    expect(b.categories[0].rows.map((r) => r.result.team.id)).toEqual(['t02', 't01'])
    expect(b.rows[0].c1).toBe(84.5)
  })

  it('counts complete drafts as provisional when asked, and ties share a rank', () => {
    const b = buildLeaderboard(records, { includeDrafts: true })
    expect(b.rows.map((r) => [r.result.team.id, r.overallRank, r.provisional])).toEqual([
      ['t02', 1, false],
      ['t05', 2, false],
      ['t09', 2, true],
      ['t01', 4, false],
    ])
    expect(b.rows[2].tiedWithAbove).toBe(true)
  })

  it('shares a rank on an equal final, whatever D1 says', () => {
    const b = buildLeaderboard([rec('t01', S77), rec('t05', sheet([4, 3, 3, 3, 3], [4, 3, 3, 2]))], { includeDrafts: false })
    expect(b.rows.map((r) => [r.result.team.id, r.overallRank, r.tiedWithAbove])).toEqual([
      ['t05', 1, false],
      ['t01', 1, true],
    ])
  })

  it('reports who moved since the last board', () => {
    const before = buildLeaderboard([rec('t01', S87), rec('t02', S62)], { includeDrafts: false })
    const after = buildLeaderboard([rec('t01', S87), rec('t02', S62), rec('t05', S77)], { includeDrafts: false })
    expect([...movements(before, after)]).toEqual([['t02', -1]])
    expect(movements(null, after).size).toBe(0)
  })
})
