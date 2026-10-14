// Rubric math, done in integers so .5 cases always round the same way.
//
// Final = 0.5 × C1 + 0.5 × C2, where
//   C1 = (D1+…+D5) / 20 × 100
//   C2 = (0.35 V1 + 0.25 V2 + 0.20 V3 + 0.20 V4) / 4 × 100
// Multiplying through by 8 gives an exact integer:
//   8 × Final = 20 (D1+…+D5) + 35 V1 + 25 V2 + 20 V3 + 20 V4
// Rounding is half-up (69.5 → 70), as in the ToT Judging Workspace.

export const D_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5'] as const
export const V_KEYS = ['v1', 'v2', 'v3', 'v4'] as const
export const CRITERIA = [...D_KEYS, ...V_KEYS] as const
export type CriterionKey = (typeof CRITERIA)[number]
export type Level = 1 | 2 | 3 | 4

/** A complete score sheet: every criterion has a level. */
export type ScoreSheet = Record<CriterionKey, Level>
/** A sheet being filled in; any criterion may still be blank. */
export type PartialSheet = Partial<Record<CriterionKey, Level>>

const V_WEIGHTS: Record<(typeof V_KEYS)[number], number> = { v1: 35, v2: 25, v3: 20, v4: 20 }

export function isComplete(sheet: PartialSheet): sheet is ScoreSheet {
  return CRITERIA.every((k) => sheet[k] !== undefined)
}

/** 8 × the unrounded final score. Exact; use this for averaging and comparisons. */
export function finalTimes8(s: ScoreSheet): number {
  const dSum = D_KEYS.reduce((acc, k) => acc + s[k], 0)
  const v = V_KEYS.reduce((acc, k) => acc + V_WEIGHTS[k] * s[k], 0)
  return 20 * dSum + v
}

/** Half-up rounding of numerator / denominator for non-negative integers. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

/** Final score 25–100, rounded half-up. */
export function finalScore(s: ScoreSheet): number {
  return roundHalfUp(finalTimes8(s), 8)
}

/**
 * Final for a team scored by several judges: average the unrounded finals,
 * then round once (ToT slide 10).
 */
export function averagedFinal(sheets: ScoreSheet[]): number {
  if (sheets.length === 0) throw new Error('averagedFinal needs at least one sheet')
  const total = sheets.reduce((acc, s) => acc + finalTimes8(s), 0)
  return roundHalfUp(total, 8 * sheets.length)
}

/** C1 out of 100, for display (always a multiple of 5). */
export function c1(s: ScoreSheet): number {
  return D_KEYS.reduce((acc, k) => acc + s[k], 0) * 5
}

/** C2 out of 100, for display (exact to 2 decimals). */
export function c2(s: ScoreSheet): number {
  const weighted = V_KEYS.reduce((acc, k) => acc + V_WEIGHTS[k] * s[k], 0) // /100 /4 ×100
  return weighted / 4
}
