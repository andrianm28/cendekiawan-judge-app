// Category ranking and the proposed Rank 1–5, per the locked winner format:
// the top team in each category wins it, then the five winners are ordered by
// final score. Judges confirm or reorder that proposal during deliberation.

import { averagedFinal, finalTimes8, type ScoreSheet } from './scoring'
import type { CategoryId, Team } from './teams'

export interface TeamResult {
  team: Team
  final: number
  /** 8 × unrounded final, averaged across judges (exact as a fraction finalTimes8Sum / judges). */
  finalTimes8Sum: number
  d1Sum: number
  d4Sum: number
  judges: number
}

export interface CategoryStanding {
  category: CategoryId
  ranked: TeamResult[]
  /** Teams with no submitted score yet. */
  missing: Team[]
  /** True when the top two cannot be separated by final, D1 or D4: judges decide. */
  tiedAtTop: boolean
}

export function teamResult(team: Team, sheets: ScoreSheet[]): TeamResult {
  return {
    team,
    final: averagedFinal(sheets),
    finalTimes8Sum: sheets.reduce((a, s) => a + finalTimes8(s), 0),
    d1Sum: sheets.reduce((a, s) => a + s.d1, 0),
    d4Sum: sheets.reduce((a, s) => a + s.d4, 0),
    judges: sheets.length,
  }
}

// Compare averages a.x / a.judges vs b.x / b.judges without division.
const avgCmp = (a: TeamResult, b: TeamResult, key: 'd1Sum' | 'd4Sum') => b[key] * a.judges - a[key] * b.judges

/** Higher final first; ties broken by D1, then D4 (ToT rule). 0 means the judges decide. */
export function compareResults(a: TeamResult, b: TeamResult): number {
  return b.final - a.final || avgCmp(a, b, 'd1Sum') || avgCmp(a, b, 'd4Sum')
}

export function rankCategory(
  category: CategoryId,
  teams: Team[],
  sheetsByTeam: Map<string, ScoreSheet[]>,
): CategoryStanding {
  const inCategory = teams.filter((t) => t.category === category)
  const scored = inCategory.filter((t) => (sheetsByTeam.get(t.id) ?? []).length > 0)
  const ranked = scored
    .map((t) => teamResult(t, sheetsByTeam.get(t.id)!))
    .sort((a, b) => compareResults(a, b) || a.team.order - b.team.order)
  return {
    category,
    ranked,
    missing: inCategory.filter((t) => !scored.includes(t)),
    tiedAtTop: ranked.length > 1 && compareResults(ranked[0], ranked[1]) === 0,
  }
}

export const AWARDS = [
  'Winner of AWS CendekiAwan',
  'Rank 2',
  'Rank 3',
  'Emerging Innovator',
  'Rising Innovator',
] as const

export interface ProposedRank {
  rank: number
  award: (typeof AWARDS)[number]
  winner: TeamResult
  /** True when this winner cannot be separated from the one above by final, D1 or D4. */
  tiedWithAbove: boolean
}

/** Order the category winners by total score into the proposed Rank 1–5. */
export function proposeRanks(standings: CategoryStanding[]): ProposedRank[] {
  const winners = standings.filter((s) => s.ranked.length > 0).map((s) => s.ranked[0])
  const sorted = [...winners].sort(compareResults)
  return sorted.map((winner, i) => ({
    rank: i + 1,
    award: AWARDS[i],
    winner,
    tiedWithAbove: i > 0 && compareResults(sorted[i - 1], winner) === 0,
  }))
}

/** Award order for the MC: Rising → Emerging → Rank 3 → Rank 2 → Rank 1. */
export const announcementOrder = (ranks: ProposedRank[]): ProposedRank[] => [...ranks].reverse()
