// CSV exports for the archive and the event report.

import { categoryOf, type Team } from './teams'
import { c1, c2, CRITERIA, finalScore, isComplete, type PartialSheet } from './scoring'
import type { FinalRank } from './deliberation'

export interface ScoreRow {
  team: Team
  judgeName: string
  sheet: PartialSheet
  note: string
  status: string
  updatedAt: string
}

const cell = (v: string | number): string => {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

export function scoresCsv(rows: ScoreRow[]): string {
  const header = ['Order', 'Group', 'Category', 'University', 'Team', 'App', 'Judge',
    ...CRITERIA.map((k) => k.toUpperCase()), 'C1', 'C2', 'Final', 'Status', 'Note', 'Updated']
  const body = [...rows]
    .sort((a, b) => a.team.order - b.team.order)
    .map((r) => {
      const cat = categoryOf(r.team.category)
      const s = r.sheet
      const done = isComplete(s)
      return [r.team.order, cat.group, cat.name, r.team.university, r.team.teamName, r.team.appName, r.judgeName,
        ...CRITERIA.map((k) => r.sheet[k] ?? ''),
        done ? c1(s) : '', done ? c2(s) : '', done ? finalScore(s) : '',
        r.status, r.note, r.updatedAt]
    })
  return toCsv([header, ...body])
}

export function resultsCsv(ranks: FinalRank[]): string {
  const header = ['Rank', 'Award', 'App', 'Team', 'University', 'Category', 'Final', 'Proposed rank']
  const body = ranks.map((r) => [r.rank, r.award, r.winner.team.appName, r.winner.team.teamName,
    r.winner.team.university, categoryOf(r.winner.team.category).name, r.winner.final, r.proposedRank])
  return toCsv([header, ...body])
}
