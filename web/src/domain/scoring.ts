// Rubric math, done in integers so .5 cases always round the same way.
//
// Eight criteria. V3 "Reliable" was dropped because the demo is a pre-recorded video, so teams
// never show a failing app (ADR 0006); D2 now scores use of AWS, not "works well" (ADR 0007).
// Weights follow the ToT UM rubric's proportions (ADR 0008): points 20 per D, 35 V1, 25 V2,
// 20 V4 (V3 dropped), with D2 "Built on AWS" raised to 25 because this is an AWS programme
// (ADR 0009). Out of 185 points:
//   37 × Final = 100 (D1+D3+D4+D5) + 125 D2 + 175 V1 + 125 V2 + 100 V4, an exact integer from 925 to 3700.
// Shown weights: D2 13.5%, other D 10.8% each, V1 18.9%, V2 13.5%, V4 10.8%.
// C1 (D side) and C2 (V side) are only subtotals for the operator's views.
// Rounding is half-up (69.5 → 70), as in the ToT Judging Workspace.

export const D_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5'] as const
export const V_KEYS = ['v1', 'v2', 'v4'] as const
export const CRITERIA = [...D_KEYS, ...V_KEYS] as const
export type CriterionKey = (typeof CRITERIA)[number]
export type Level = 1 | 2 | 3 | 4

/** A complete score sheet: every criterion has a level. */
export type ScoreSheet = Record<CriterionKey, Level>
/** A sheet being filled in; any criterion may still be blank. */
export type PartialSheet = Partial<Record<CriterionKey, Level>>

/** Each criterion's points per level; Final = Σ weight × level ÷ FINAL_SCALE. */
export const WEIGHTS: Record<CriterionKey, number> = { d1: 100, d2: 125, d3: 100, d4: 100, d5: 100, v1: 175, v2: 125, v4: 100 }
/** All levels at 4 give 4 × Σ WEIGHTS = 3700 = 100 × FINAL_SCALE. */
export const FINAL_SCALE = 37

export function isComplete(sheet: PartialSheet): sheet is ScoreSheet {
  return CRITERIA.every((k) => sheet[k] !== undefined)
}

/** FINAL_SCALE × the unrounded final score. Exact; use this for averaging and comparisons. */
export function finalScaled(s: ScoreSheet): number {
  return CRITERIA.reduce((acc, k) => acc + WEIGHTS[k] * s[k], 0)
}

/** Half-up rounding of numerator / denominator for non-negative integers. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

/** Final score 25–100, rounded half-up. */
export function finalScore(s: ScoreSheet): number {
  return roundHalfUp(finalScaled(s), FINAL_SCALE)
}

/**
 * Final for a team scored by several judges: average the unrounded finals,
 * then round once (ToT slide 10).
 */
export function averagedFinal(sheets: ScoreSheet[]): number {
  if (sheets.length === 0) throw new Error('averagedFinal needs at least one sheet')
  const total = sheets.reduce((acc, s) => acc + finalScaled(s), 0)
  return roundHalfUp(total, FINAL_SCALE * sheets.length)
}

const part = (s: ScoreSheet, keys: readonly CriterionKey[]): number => {
  const got = keys.reduce((acc, k) => acc + WEIGHTS[k] * s[k], 0)
  const max = keys.reduce((acc, k) => acc + WEIGHTS[k] * 4, 0)
  return Math.round((got / max) * 10000) / 100
}

/** C1 (pitch side) out of 100, for the operator's views (2 decimals). */
export const c1 = (s: ScoreSheet): number => part(s, D_KEYS)

/** C2 (app side) out of 100, for the operator's views (2 decimals). */
export const c2 = (s: ScoreSheet): number => part(s, V_KEYS)
