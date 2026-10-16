// Rubric math, done in integers so .5 cases always round the same way.
//
// Seven criteria (ADR 0006: D2 "Works well" and V3 "Reliable" were dropped because the demo is a
// pre-recorded video, so teams never show a failing app). The rest keep the ToT UM ratios:
// Final = 0.5 × C1 + 0.5 × C2, where
//   C1 = (D1+D3+D4+D5) / 16 × 100
//   C2 = (35 V1 + 25 V2 + 20 V4) / 80 / 4 × 100
// Multiplying through by 32 gives an exact integer:
//   32 × Final = 100 (D1+D3+D4+D5) + 175 V1 + 125 V2 + 100 V4
// Effective weights: D 12.5% each, V1 21.875%, V2 15.625%, V4 12.5%.
// Rounding is half-up (69.5 → 70), as in the ToT Judging Workspace.

export const D_KEYS = ['d1', 'd3', 'd4', 'd5'] as const
export const V_KEYS = ['v1', 'v2', 'v4'] as const
export const CRITERIA = [...D_KEYS, ...V_KEYS] as const
export type CriterionKey = (typeof CRITERIA)[number]
export type Level = 1 | 2 | 3 | 4

/** A complete score sheet: every criterion has a level. */
export type ScoreSheet = Record<CriterionKey, Level>
/** A sheet being filled in; any criterion may still be blank. */
export type PartialSheet = Partial<Record<CriterionKey, Level>>

/** Each criterion's points per level; Final = Σ weight × level ÷ FINAL_SCALE. */
export const WEIGHTS: Record<CriterionKey, number> = { d1: 100, d3: 100, d4: 100, d5: 100, v1: 175, v2: 125, v4: 100 }
/** All levels at 4 give 4 × Σ WEIGHTS = 3200 = 100 × FINAL_SCALE. */
export const FINAL_SCALE = 32

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
