import { describe, expect, it } from 'vitest'
import type { ScoreSheet } from './scoring'
import { categoryTies, type SheetInput } from './ties'

const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({ d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4], v1: v[0], v2: v[1], v3: v[2], v4: v[3] }) as ScoreSheet
const A = sheet([4, 3, 3, 3, 3], [4, 3, 3, 2]) // 80
const B = sheet([3, 3, 3, 4, 3], [4, 3, 3, 2]) // 80
const LOW = sheet([3, 2, 2, 3, 2], [3, 2, 2, 2]) // 60

const health = (judges: string[], t05 = B): SheetInput[] =>
  judges.flatMap(() => [
    { teamId: 't05', sheet: t05, status: 'submitted' as const },
    { teamId: 't06', sheet: A, status: 'submitted' as const },
    { teamId: 't07', sheet: LOW, status: 'submitted' as const },
    { teamId: 't08', sheet: LOW, status: 'submitted' as const },
  ])

describe('categoryTies', () => {
  it('offers a tie only once every judge has submitted every team in the category', () => {
    expect(categoryTies(health(['g1']), 2, {})).toEqual([])
    const [t] = categoryTies(health(['g1', 'g2']), 2, {})
    expect(t.category).toBe('health')
    expect(t.tied.map((x) => [x.teamId, x.final, x.d1])).toEqual([['t06', 80, 4], ['t05', 80, 3]])
    expect(t.pick).toBeNull()
  })

  it('keeps a pick that still fits and drops one that no longer does', () => {
    expect(categoryTies(health(['g1', 'g2']), 2, { health: { teamId: 't05', by: 'g2', at: '' } })[0].pick).toBe('t05')
    expect(categoryTies(health(['g1', 'g2']), 2, { health: { teamId: 't07', by: 'g2', at: '' } })[0].pick).toBeNull()
    expect(categoryTies(health(['g1', 'g2'], LOW), 2, { health: { teamId: 't05', by: 'g2', at: '' } })).toEqual([])
  })
})
