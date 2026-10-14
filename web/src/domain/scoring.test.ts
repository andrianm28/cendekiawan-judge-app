import { describe, expect, it } from 'vitest'
import { averagedFinal, c1, c2, CRITERIA, finalScore, type Level, type ScoreSheet } from './scoring'

const sheet = (d: number[], v: number[]): ScoreSheet =>
  ({
    d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4],
    v1: v[0], v2: v[1], v3: v[2], v4: v[3],
  }) as ScoreSheet

describe('finalScore', () => {
  // Worked examples from the ToT UM slides.
  it('WarisAI = 77', () => {
    const s = sheet([3, 3, 3, 4, 2], [4, 3, 3, 2])
    expect(c1(s)).toBe(75)
    expect(c2(s)).toBe(78.75)
    expect(finalScore(s)).toBe(77)
  })
  it('KelasKu = 59', () => {
    const s = sheet([3, 2, 2, 3, 2], [3, 2, 2, 2])
    expect(c1(s)).toBe(60)
    expect(c2(s)).toBe(58.75)
    expect(finalScore(s)).toBe(59)
  })
  it('HealthPath = 84', () => {
    const s = sheet([4, 3, 3, 4, 3], [4, 3, 3, 3])
    expect(c1(s)).toBe(85)
    expect(c2(s)).toBe(83.75)
    expect(finalScore(s)).toBe(84)
  })
  it('spans 25 to 100', () => {
    expect(finalScore(sheet([1, 1, 1, 1, 1], [1, 1, 1, 1]))).toBe(25)
    expect(finalScore(sheet([4, 4, 4, 4, 4], [4, 4, 4, 4]))).toBe(100)
  })
  it('rounds .5 up for every one of the 4^9 combinations', () => {
    const levels: Level[] = [1, 2, 3, 4]
    let checked = 0
    for (let i = 0; i < 4 ** 9; i++) {
      const s = {} as ScoreSheet
      let n = i
      for (const k of CRITERIA) {
        s[k] = levels[n % 4]
        n = Math.floor(n / 4)
      }
      // Reference in exact hundredths: Final × 100 = 0.5×C1×100 + 0.5×C2×100.
      const dSum = s.d1 + s.d2 + s.d3 + s.d4 + s.d5
      const hundredths = 250 * dSum + 437.5 * s.v1 + 312.5 * s.v2 + 250 * s.v3 + 250 * s.v4
      const expected = Math.floor(hundredths / 100 + 0.5)
      expect(finalScore(s)).toBe(expected)
      checked++
    }
    expect(checked).toBe(262144)
  })
})

describe('averagedFinal', () => {
  it('averages unrounded finals, then rounds once', () => {
    const a = sheet([3, 3, 3, 4, 2], [4, 3, 3, 2]) // 76.875
    const b = sheet([3, 3, 3, 3, 3], [4, 3, 3, 2]) // 76.875
    expect(averagedFinal([a, b])).toBe(77)
  })
  it('differs from averaging already-rounded finals', () => {
    const a = sheet([1, 1, 1, 1, 1], [2, 3, 4, 4]) // 50.625, rounds to 51
    const b = sheet([1, 1, 1, 1, 1], [1, 1, 1, 2]) // 27.5, rounds to 28
    // Exact mean 39.0625 → 39. Rounding first would give (51 + 28) / 2 = 39.5 → 40.
    expect(finalScore(a)).toBe(51)
    expect(finalScore(b)).toBe(28)
    expect(averagedFinal([a, b])).toBe(39)
  })
  it('rejects an empty list', () => {
    expect(() => averagedFinal([])).toThrow()
  })
})
