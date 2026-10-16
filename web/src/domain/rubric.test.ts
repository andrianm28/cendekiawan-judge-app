import { describe, expect, it } from 'vitest'
import { ALL_CRITERIA } from './rubric'
import { CRITERIA, FINAL_SCALE, WEIGHTS } from './scoring'

describe('rubric', () => {
  it('shows each of the seven criteria exactly once', () => {
    expect(ALL_CRITERIA.map((c) => c.key).sort()).toEqual([...CRITERIA].sort())
  })

  it('shows weights that are each criterion\'s real share of the final', () => {
    expect(ALL_CRITERIA.reduce((acc, c) => acc + parseFloat(c.weight), 0)).toBeCloseTo(100, 6)
    for (const c of ALL_CRITERIA) {
      // Share of the final = weight × 4 levels ÷ (100 × FINAL_SCALE) of 100%.
      const share = (WEIGHTS[c.key] * 4) / FINAL_SCALE
      expect(parseFloat(c.weight)).toBeCloseTo(share, 1)
    }
  })
})
