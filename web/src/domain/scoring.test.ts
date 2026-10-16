import { describe, expect, it } from 'vitest'
import { averagedFinal, c1, c2, CRITERIA, finalScore, type Level, type ScoreSheet } from './scoring'

// d = [D1, D2, D3, D4, D5], v = [V1, V2, V4]
const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({ d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4], v1: v[0], v2: v[1], v4: v[2] }) as ScoreSheet

describe('finalScore', () => {
  it('keeps the ToT proportions: 36 × Final = 100 ΣD + 175 V1 + 125 V2 + 100 V4', () => {
    const s = sheet([4, 3, 3, 4, 3], [4, 3, 2]) // 2975 / 36 = 82.64
    expect(c1(s)).toBe(85)
    expect(c2(s)).toBe(79.69)
    expect(finalScore(s)).toBe(83)
  })
  it('gives 75 for level 3 everywhere, as the participant guide says', () => {
    expect(finalScore(sheet([3, 3, 3, 3, 3], [3, 3, 3]))).toBe(75)
  })
  it('spans 25 to 100', () => {
    expect(finalScore(sheet([1, 1, 1, 1, 1], [1, 1, 1]))).toBe(25)
    expect(finalScore(sheet([4, 4, 4, 4, 4], [4, 4, 4]))).toBe(100)
  })
  it('rounds .5 up for every one of the 4^8 combinations', () => {
    const levels: Level[] = [1, 2, 3, 4]
    let checked = 0
    for (let i = 0; i < 4 ** 8; i++) {
      const s = {} as ScoreSheet
      let n = i
      for (const k of CRITERIA) {
        s[k] = levels[n % 4]
        n = Math.floor(n / 4)
      }
      // Reference from the ToT points: (20 per D, 35 V1, 25 V2, 20 V4) out of 180, × 4 levels, as % of 720.
      const dSum = s.d1 + s.d2 + s.d3 + s.d4 + s.d5
      const points = 100 * (20 * dSum + 35 * s.v1 + 25 * s.v2 + 20 * s.v4)
      expect(finalScore(s)).toBe(Math.floor(points / 720 + 0.5))
      checked++
    }
    expect(checked).toBe(65536)
  })
})

describe('averagedFinal', () => {
  it('averages unrounded finals, then rounds once', () => {
    const a = sheet([3, 3, 3, 4, 3], [4, 3, 2]) // 2875 / 36 = 79.86
    const b = sheet([3, 3, 3, 3, 4], [4, 3, 2]) // 79.86
    expect(averagedFinal([a, b])).toBe(80)
  })
  it('differs from averaging already-rounded finals', () => {
    const c = sheet([1, 1, 1, 1, 1], [1, 1, 1]) // 900 / 36 = 25
    const d = sheet([2, 1, 1, 1, 1], [1, 1, 1]) // 1000 / 36 = 27.78, rounds to 28
    // Exact mean 26.39 → 26. Rounding first would give (25 + 28) / 2 = 26.5 → 27.
    expect(averagedFinal([c, d])).toBe(26)
  })
  it('rejects an empty list', () => {
    expect(() => averagedFinal([])).toThrow()
  })
})
