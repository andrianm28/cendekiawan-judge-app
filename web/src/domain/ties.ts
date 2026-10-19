// Ties at the top of a category, for the judge who owns that category to decide.
// Shared by the API (which enforces who may pick) and the screens.

import { average, categoryComplete, rankCategory } from './ranking'
import { c1, c2, isComplete, type PartialSheet, type ScoreSheet } from './scoring'
import { CATEGORIES, TEAMS, type CategoryId } from './teams'

export interface TieBreak {
  teamId: string
  /** The teams tied when the pick was made; the pick stops applying if the tie changes. */
  tied?: string[]
  /** Judge id, or 'admin' when the operator recorded it. */
  by: string
  at: string
}

export type TieBreaks = Partial<Record<CategoryId, TieBreak>>

export interface TiedTeam {
  teamId: string
  final: number
  c1: number
  c2: number
  d1: number
  d4: number
}

export interface TieSummary {
  category: CategoryId
  tied: TiedTeam[]
  /** The picked team, when the pick still applies to the current tie. */
  pick: string | null
}

export interface SheetInput {
  teamId: string
  sheet: PartialSheet
  status: 'draft' | 'submitted'
}

export function submittedSheets(records: SheetInput[]): Map<string, ScoreSheet[]> {
  const m = new Map<string, ScoreSheet[]>()
  for (const r of records) {
    if (r.status !== 'submitted' || !isComplete(r.sheet)) continue
    m.set(r.teamId, [...(m.get(r.teamId) ?? []), r.sheet])
  }
  return m
}

/**
 * Categories whose scoring is complete (every judge submitted every team) and whose
 * top final is shared. Ties are only offered once scoring is complete, so a late
 * sheet cannot undo a pick made on partial scores.
 */
export function categoryTies(records: SheetInput[], judges: number, picks: TieBreaks): TieSummary[] {
  const sheets = submittedSheets(records)
  const out: TieSummary[] = []
  for (const c of CATEGORIES) {
    if (!categoryComplete(c.id, TEAMS, sheets, judges)) continue
    const s = rankCategory(c.id, TEAMS, sheets, picks[c.id])
    if (s.tiedTop.length < 2) continue
    out.push({
      category: c.id,
      pick: s.pick,
      tied: s.tiedTop.map((r) => {
        const own = sheets.get(r.team.id)!
        return {
          teamId: r.team.id,
          final: r.final,
          c1: average(own, c1),
          c2: average(own, c2),
          d1: average(own, (x) => x.d1),
          d4: average(own, (x) => x.d4),
        }
      }),
    })
  }
  return out
}
