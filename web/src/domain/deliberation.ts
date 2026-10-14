// Deliberation: judges confirm or reorder the proposed Rank 1–5, each move with
// a logged reason, then lock the result for the MC.

import { AWARDS, type ProposedRank } from './ranking'

export interface RankChange {
  at: string
  teamId: string
  from: number
  to: number
  reason: string
}

export interface Deliberation {
  /** Team ids of the category winners, Rank 1 first. Empty means "use the proposal". */
  order: string[]
  log: RankChange[]
  lockedAt: string | null
}

export const EMPTY_DELIBERATION: Deliberation = { order: [], log: [], lockedAt: null }

export interface FinalRank extends ProposedRank {
  /** Rank the scores proposed, before any reorder. */
  proposedRank: number
}

/**
 * Apply the judges' order to the current proposal. If the set of category winners
 * has changed since the order was saved (a late score), the saved order no longer
 * fits and the proposal is used: `stale` tells the screen to say so.
 */
export function applyOrder(proposed: ProposedRank[], d: Deliberation): { ranks: FinalRank[]; stale: boolean } {
  const ids = proposed.map((p) => p.winner.team.id)
  const fits = d.order.length === ids.length && ids.every((id) => d.order.includes(id))
  const order = fits ? d.order : ids
  const ranks = order.map((id, i) => {
    const p = proposed.find((x) => x.winner.team.id === id)!
    return { ...p, rank: i + 1, award: AWARDS[i], proposedRank: p.rank, tiedWithAbove: fits ? false : p.tiedWithAbove }
  })
  return { ranks, stale: d.order.length > 0 && !fits }
}

/** Move the team at `from` (1-based rank) to `to`. A reason is required. */
export function moveRank(
  ranks: FinalRank[],
  d: Deliberation,
  from: number,
  to: number,
  reason: string,
  now: Date = new Date(),
): Deliberation {
  if (d.lockedAt) throw new Error('Result is locked')
  if (!reason.trim()) throw new Error('A reason is required to change the order')
  if (from < 1 || to < 1 || from > ranks.length || to > ranks.length || from === to) {
    throw new Error('Invalid move')
  }
  const order = ranks.map((r) => r.winner.team.id)
  const [teamId] = order.splice(from - 1, 1)
  order.splice(to - 1, 0, teamId)
  return {
    ...d,
    order,
    log: [...d.log, { at: now.toISOString(), teamId, from, to, reason: reason.trim() }],
  }
}

export function lock(ranks: FinalRank[], d: Deliberation, now: Date = new Date()): Deliberation {
  if (d.lockedAt) return d
  return { ...d, order: ranks.map((r) => r.winner.team.id), lockedAt: now.toISOString() }
}
