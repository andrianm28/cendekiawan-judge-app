import { describe, expect, it } from 'vitest'
import { ALL_CRITERIA } from './rubric'
import { CRITERIA, finalScore, type ScoreSheet } from './scoring'

describe('rubric', () => {
  it('shows each of the nine criteria exactly once', () => {
    expect(ALL_CRITERIA.map((c) => c.key).sort()).toEqual([...CRITERIA].sort())
  })

  it('shows weights that are each criterion\'s real share of the final', () => {
    expect(ALL_CRITERIA.reduce((acc, c) => acc + parseFloat(c.weight), 0)).toBe(100)
    for (const c of ALL_CRITERIA) {
      const base = Object.fromEntries(CRITERIA.map((k) => [k, 1])) as ScoreSheet
      // Moving one criterion from 1 to 4 adds 3/4 of its weight to the final.
      const gain = (finalScore({ ...base, [c.key]: 4 }) * 8 - 25 * 8) // finals are rounded; compare on 8×
      expect(Math.abs(gain / 8 - parseFloat(c.weight) * 0.75)).toBeLessThanOrEqual(0.5)
    }
  })
})
