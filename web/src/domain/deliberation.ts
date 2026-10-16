// Deliberation: judges confirm the proposed Rank 1–5, order winners whose unrounded
// averages are exactly equal (each move with a logged reason), then lock the result
// for the MC. Winners with different averages keep their score order (ADR 0010).

import { AWARDS, compareResults, sameFinal, type ProposedRank } from './ranking'

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

/** True when the winners at 1-based ranks `from` and `to` are next to each other and exactly tied. */
export function canSwap(ranks: FinalRank[], from: number, to: number): boolean {
  if (Math.abs(from - to) !== 1 || from < 1 || to < 1 || from > ranks.length || to > ranks.length) return false
  return sameFinal(ranks[from - 1].winner, ranks[to - 1].winner)
}

/** Swap the team at `from` (1-based rank) with its exactly tied neighbour at `to`. A reason is required. */
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
  if (!canSwap(ranks, from, to)) throw new Error('Only winners with exactly the same average can change places')
  const order = ranks.map((r) => r.winner.team.id)
  const [teamId] = order.splice(from - 1, 1)
  order.splice(to - 1, 0, teamId)
  return {
    ...d,
    order,
    log: [...d.log, { at: now.toISOString(), teamId, from, to, reason: reason.trim() }],
  }
}

/**
 * True when `order` lists the proposed winners with no lower average above a higher
 * one, so only exactly tied winners have changed places. An order that does not hold
 * the current winners is left to `applyOrder`, which falls back to the proposal.
 */
export function keepsScoreOrder(proposed: ProposedRank[], order: string[]): boolean {
  const byId = new Map(proposed.map((p) => [p.winner.team.id, p.winner]))
  if (order.length !== byId.size || !order.every((id) => byId.has(id))) return true
  return order.every((id, i) => i === 0 || sameFinal(byId.get(order[i - 1])!, byId.get(id)!) || compareResults(byId.get(order[i - 1])!, byId.get(id)!) < 0)
}

export function lock(ranks: FinalRank[], d: Deliberation, now: Date = new Date()): Deliberation {
  if (d.lockedAt) return d
  return { ...d, order: ranks.map((r) => r.winner.team.id), lockedAt: now.toISOString() }
}
