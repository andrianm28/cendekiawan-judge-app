// Live leaderboard: every team ranked overall and within its category, from the
// scores in hand right now. Submitted sheets always count; complete drafts count
// only when asked, and the row is then marked provisional.

import { compareResults, proposeRanks, sameFinal, rankCategory, type ProposedRank, type TeamResult } from './ranking'
import { c1, c2, isComplete, type ScoreSheet } from './scoring'
import { CATEGORIES, TEAMS, type CategoryId, type Team } from './teams'
import type { TieBreaks } from './ties'

export interface ScoreInput {
  teamId: string
  judgeId: string
  sheet: Parameters<typeof isComplete>[0]
  status: 'draft' | 'submitted'
}

export interface LeaderRow {
  result: TeamResult
  overallRank: number
  categoryRank: number
  /** Same final as the row above. */
  tiedWithAbove: boolean
  c1: number
  c2: number
  /** At least one counted sheet is still a draft. */
  provisional: boolean
  /** Award from the proposed Rank 1–5, if this team is a category winner. */
  award?: ProposedRank['award']
}

export interface CategoryBoard {
  category: CategoryId
  rows: LeaderRow[]
  missing: Team[]
  /** Equal at the top with no pick yet: the category's judge decides. */
  tiedAtTop: boolean
  pick: string | null
}

export interface Leaderboard {
  rows: LeaderRow[]
  unscored: Team[]
  categories: CategoryBoard[]
  podium: ProposedRank[]
  submitted: number
  drafts: number
  /** Sheets expected: every judge scores every team. */
  total: number
  judges: number
}

const avg1 = (sheets: ScoreSheet[], f: (s: ScoreSheet) => number) =>
  Math.round((sheets.reduce((a, s) => a + f(s), 0) / sheets.length) * 10) / 10

export function buildLeaderboard(
  records: ScoreInput[],
  { includeDrafts, picks = {}, judges = 1 }: { includeDrafts: boolean; picks?: TieBreaks; judges?: number },
): Leaderboard {
  const sheetsByTeam = new Map<string, ScoreSheet[]>()
  const provisional = new Set<string>()
  let submitted = 0
  let drafts = 0
  for (const r of records) {
    if (!isComplete(r.sheet)) continue
    if (r.status === 'submitted') submitted++
    else drafts++
    if (r.status !== 'submitted' && !includeDrafts) continue
    sheetsByTeam.set(r.teamId, [...(sheetsByTeam.get(r.teamId) ?? []), r.sheet])
    if (r.status !== 'submitted') provisional.add(r.teamId)
  }

  const standings = CATEGORIES.map((c) => rankCategory(c.id, TEAMS, sheetsByTeam, picks[c.id]))
  const podium = proposeRanks(standings)
  const awardOf = new Map(podium.map((p) => [p.winner.team.id, p.award]))
  const categoryRankOf = new Map<string, number>()
  for (const s of standings) s.ranked.forEach((r, i) => categoryRankOf.set(r.team.id, i + 1))

  // Among exactly equal averages the team its category judge picked comes first, as in its category.
  const picked = new Set(standings.map((s) => s.pick).filter(Boolean))
  const pickedFirst = (a: TeamResult, b: TeamResult) =>
    sameFinal(a, b) ? Number(picked.has(b.team.id)) - Number(picked.has(a.team.id)) : 0
  const sorted = standings.flatMap((s) => s.ranked).sort((a, b) => pickedFirst(a, b) || compareResults(a, b) || a.team.order - b.team.order)
  const rows: LeaderRow[] = []
  sorted.forEach((result, i) => {
    const tied = i > 0 && sameFinal(sorted[i - 1], result)
    const sheets = sheetsByTeam.get(result.team.id)!
    rows.push({
      result,
      // Equal teams share a rank (1, 2, 2, 4).
      overallRank: tied ? rows[i - 1].overallRank : i + 1,
      categoryRank: categoryRankOf.get(result.team.id)!,
      tiedWithAbove: tied,
      c1: avg1(sheets, c1),
      c2: avg1(sheets, c2),
      provisional: provisional.has(result.team.id),
      award: awardOf.get(result.team.id),
    })
  })
  const rowOf = new Map(rows.map((r) => [r.result.team.id, r]))

  return {
    rows,
    unscored: TEAMS.filter((t) => !rowOf.has(t.id)),
    categories: standings.map((s) => ({
      category: s.category,
      rows: s.ranked.map((r) => rowOf.get(r.team.id)!),
      missing: s.missing,
      tiedAtTop: s.tiedAtTop,
      pick: s.pick,
    })),
    podium,
    submitted,
    drafts,
    total: TEAMS.length * judges,
    judges,
  }
}

/** Places each team moved since the previous board: positive is up. */
export function movements(before: Leaderboard | null, after: Leaderboard): Map<string, number> {
  const moved = new Map<string, number>()
  if (!before) return moved
  const prev = new Map(before.rows.map((r) => [r.result.team.id, r.overallRank]))
  for (const r of after.rows) {
    const was = prev.get(r.result.team.id)
    if (was !== undefined && was !== r.overallRank) moved.set(r.result.team.id, was - r.overallRank)
  }
  return moved
}
