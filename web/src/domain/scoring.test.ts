import { describe, expect, it } from 'vitest'
import { averagedFinal, c1, c2, CRITERIA, finalScore, type Level, type ScoreSheet } from './scoring'

// d = [D1, D3, D4, D5], v = [V1, V2, V4]
const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({ d1: d[0], d3: d[1], d4: d[2], d5: d[3], v1: v[0], v2: v[1], v4: v[2] }) as ScoreSheet

describe('finalScore', () => {
  it('keeps the ToT ratios: 32 × Final = 100 ΣD + 175 V1 + 125 V2 + 100 V4', () => {
    const s = sheet([3, 3, 4, 2], [4, 3, 2]) // 2475 / 32 = 77.34
    expect(c1(s)).toBe(75)
    expect(c2(s)).toBe(79.69)
    expect(finalScore(s)).toBe(77)
  })
  it('gives 75 for level 3 everywhere, as the participant guide says', () => {
    expect(finalScore(sheet([3, 3, 3, 3], [3, 3, 3]))).toBe(75)
  })
  it('spans 25 to 100', () => {
    expect(finalScore(sheet([1, 1, 1, 1], [1, 1, 1]))).toBe(25)
    expect(finalScore(sheet([4, 4, 4, 4], [4, 4, 4]))).toBe(100)
  })
  it('rounds .5 up for every one of the 4^7 combinations', () => {
    const levels: Level[] = [1, 2, 3, 4]
    let checked = 0
    for (let i = 0; i < 4 ** 7; i++) {
      const s = {} as ScoreSheet
      let n = i
      for (const k of CRITERIA) {
        s[k] = levels[n % 4]
        n = Math.floor(n / 4)
      }
      // Reference in exact thousandths: Final × 1000 = 0.5×C1×1000 + 0.5×C2×1000.
      const dSum = s.d1 + s.d3 + s.d4 + s.d5
      const thousandths = 3125 * dSum + 5468.75 * s.v1 + 3906.25 * s.v2 + 3125 * s.v4
      expect(finalScore(s)).toBe(Math.floor(thousandths / 1000 + 0.5))
      checked++
    }
    expect(checked).toBe(16384)
  })
})

describe('averagedFinal', () => {
  it('averages unrounded finals, then rounds once', () => {
    const a = sheet([3, 3, 4, 2], [4, 3, 2]) // 77.34
    const b = sheet([3, 3, 3, 3], [4, 3, 2]) // 77.34
    expect(averagedFinal([a, b])).toBe(77)
  })
  it('differs from averaging already-rounded finals', () => {
    const c = sheet([1, 1, 1, 1], [1, 2, 1]) // 925 / 32 = 28.90625, rounds to 29
    const d = sheet([1, 1, 2, 1], [2, 1, 1]) // 1075 / 32 = 33.59375, rounds to 34
    // Exact mean 31.25 → 31. Rounding first would give (29 + 34) / 2 = 31.5 → 32.
    expect(averagedFinal([c, d])).toBe(31)
  })
  it('rejects an empty list', () => {
    expect(() => averagedFinal([])).toThrow()
  })
})
