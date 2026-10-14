// Category ranking and the proposed Rank 1–5, per the locked winner format:
// the top team in each category wins it, then the five winners are ordered by
// final score. Judges confirm or reorder that proposal during deliberation.
//
// Every judge scores every team and a team's final is the average across judges.
// When the top finals in a category are equal, the judge who owns that category
// picks the winner (ADR 0003); D1 and D4 are shown to help, not applied.

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
  /** Teams sharing the top final; more than one means a tie. */
  tiedTop: TeamResult[]
  /** The tied team the category's judge picked, if that pick still applies. */
  pick: string | null
  /** True while a tie at the top has no pick: the category's judge decides. */
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

/**
 * Higher final first. Equal finals are listed by D1, then D4, only so the order is
 * stable on screen; they still count as a tie (see `sameFinal`) and judges decide.
 */
export function compareResults(a: TeamResult, b: TeamResult): number {
  return b.final - a.final || avgCmp(a, b, 'd1Sum') || avgCmp(a, b, 'd4Sum')
}

/** Equal finals are a tie, whatever D1 and D4 say (ADR 0003). */
export const sameFinal = (a: TeamResult, b: TeamResult): boolean => a.final === b.final

export function rankCategory(
  category: CategoryId,
  teams: Team[],
  sheetsByTeam: Map<string, ScoreSheet[]>,
  /** Team the category's judge picked to break a tie at the top. */
  pick?: string | null,
): CategoryStanding {
  const inCategory = teams.filter((t) => t.category === category)
  const scored = inCategory.filter((t) => (sheetsByTeam.get(t.id) ?? []).length > 0)
  const sorted = scored
    .map((t) => teamResult(t, sheetsByTeam.get(t.id)!))
    .sort((a, b) => compareResults(a, b) || a.team.order - b.team.order)
  const tiedTop = sorted.length > 1 && sorted[0].final === sorted[1].final ? sorted.filter((r) => r.final === sorted[0].final) : sorted.slice(0, 1)
  const tie = tiedTop.length > 1
  const applies = tie && !!pick && tiedTop.some((r) => r.team.id === pick)
  const ranked = applies ? [...sorted.filter((r) => r.team.id === pick), ...sorted.filter((r) => r.team.id !== pick)] : sorted
  return {
    category,
    ranked,
    missing: inCategory.filter((t) => !scored.includes(t)),
    tiedTop,
    pick: applies ? pick! : null,
    tiedAtTop: tie && !applies,
  }
}

/** Average of a per-sheet measure, to one decimal, for display. */
export const average = (sheets: ScoreSheet[], f: (s: ScoreSheet) => number): number =>
  Math.round((sheets.reduce((a, s) => a + f(s), 0) / sheets.length) * 10) / 10

/** True when every team in the category has a submitted sheet from every judge. */
export function categoryComplete(category: CategoryId, teams: Team[], sheetsByTeam: Map<string, ScoreSheet[]>, judges: number): boolean {
  return teams.filter((t) => t.category === category).every((t) => (sheetsByTeam.get(t.id) ?? []).length >= judges)
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
  /** True when this winner has the same final as the one above: the judges decide the order in deliberation. */
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
    tiedWithAbove: i > 0 && sameFinal(sorted[i - 1], winner),
  }))
}

/** Award order for the MC: Rising → Emerging → Rank 3 → Rank 2 → Rank 1. */
export const announcementOrder = (ranks: ProposedRank[]): ProposedRank[] => [...ranks].reverse()
