// The running order: which team presents when. The operator sets it on the day and
// marks the team on stage; every judge's tablet lists teams in this order.
//
// Teams present category by category. The operator can reorder teams inside a category
// but not move a team into another category's block, and once a category has been on
// stage the show never goes back to an earlier one.

import { TEAMS, type CategoryId } from './teams'

export interface RunOrder {
  /** Team ids, first to present first. */
  order: string[]
  /** Team presenting now, or null before the first pitch / after the last. */
  current: string | null
  /** When the operator started the 5-minute pitch timer for the current team (server clock). */
  startedAt: string | null
  /** When the operator paused the timer (between the deck and the video), or null while it runs. */
  pausedAt?: string | null
  /** Time already spent paused before `pausedAt`, ms. */
  pausedMs?: number
  /** Furthest category block (0-based, in running order) that has been on stage; -1 before the first. */
  reached?: number
  /** Judges' deliberation is open: judges may change scores they already submitted. */
  deliberation?: boolean
}

export const DEFAULT_RUN_ORDER: RunOrder = {
  order: TEAMS.map((t) => t.id), current: null, startedAt: null, pausedAt: null, pausedMs: 0, reached: -1, deliberation: false,
}

const categoryOfTeam = (id: string): CategoryId | undefined => TEAMS.find((t) => t.id === id)?.category
const isTime = (s: unknown): s is string => typeof s === 'string' && !Number.isNaN(Date.parse(s))

/** Keep only known teams, each once, and append any missing in showcase order. */
export function normalizeRunOrder(r: Partial<RunOrder> | null | undefined): RunOrder {
  const known = new Set(TEAMS.map((t) => t.id))
  const order = [...new Set((r?.order ?? []).filter((id) => known.has(id)))]
  for (const t of TEAMS) if (!order.includes(t.id)) order.push(t.id)
  const current = r?.current && known.has(r.current) ? r.current : null
  const startedAt = current && isTime(r?.startedAt) ? r.startedAt : null
  const pausedAt = startedAt && isTime(r?.pausedAt) ? r.pausedAt : null
  const pausedMs = startedAt && Number.isFinite(r?.pausedMs) && r!.pausedMs! > 0 ? Math.round(r!.pausedMs!) : 0
  const reached = Number.isInteger(r?.reached) ? Math.max(-1, Math.min(r!.reached!, blocks(order).length - 1)) : -1
  return { order, current, startedAt, pausedAt, pausedMs, reached: Math.max(reached, blockOf(order, current)), deliberation: r?.deliberation === true }
}

/** Categories in the order their teams present. */
export function blocks(order: string[]): CategoryId[] {
  const out: CategoryId[] = []
  for (const id of order) {
    const c = categoryOfTeam(id)
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

/** Index of a team's category block in the running order, or -1. */
export function blockOf(order: string[], teamId: string | null): number {
  const c = teamId ? categoryOfTeam(teamId) : undefined
  return c ? blocks(order).indexOf(c) : -1
}

/** The order only moved teams inside their own category: every position keeps its category. */
export function sameCategoryLayout(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => categoryOfTeam(id) === categoryOfTeam(b[i]))
}

/** The operator may put this team on stage: not in a category the show has already left. */
export function canPutOnStage(r: RunOrder, teamId: string): boolean {
  return blockOf(r.order, teamId) >= (r.reached ?? -1)
}

export function moveInOrder(r: RunOrder, teamId: string, delta: number): RunOrder {
  const i = r.order.indexOf(teamId)
  return i < 0 ? r : moveTo(r, teamId, i + delta)
}

/**
 * Move a team to a new position (drag and drop); other teams keep their relative order.
 * The team stays inside its category's block: a drop past the block lands at its edge.
 */
export function moveTo(r: RunOrder, teamId: string, toIndex: number): RunOrder {
  const from = r.order.indexOf(teamId)
  if (from < 0) return r
  const c = categoryOfTeam(teamId)
  const same = r.order.map((id, i) => (categoryOfTeam(id) === c ? i : -1)).filter((i) => i >= 0)
  const to = Math.max(same[0], Math.min(same[same.length - 1], toIndex))
  if (to === from) return r
  const order = r.order.filter((id) => id !== teamId)
  order.splice(to, 0, teamId)
  return { ...r, order }
}

/** The team after (or before) the one presenting now; starts at the first team. Never steps back into an earlier category. */
export function stepCurrent(r: RunOrder, delta: 1 | -1): Partial<RunOrder> {
  const i = r.current ? r.order.indexOf(r.current) : -1
  const j = r.current ? i + delta : delta > 0 ? 0 : -1
  const next = j >= 0 && j < r.order.length ? r.order[j] : null
  if (next && !canPutOnStage(r, next)) return { current: r.current }
  return { current: next }
}

/** Every team has presented: the stage is empty and the show has reached its last category. */
export function showFinished(r: RunOrder): boolean {
  return !r.current && (r.reached ?? -1) >= blocks(r.order).length - 1
}

/** Can the operator step back from the team on stage without leaving its category? */
export function canStepBack(r: RunOrder): boolean {
  if (!r.current) return false
  const i = r.order.indexOf(r.current)
  return i > 0 && canPutOnStage(r, r.order[i - 1])
}

/** The pitch timer on this device's clock: when it started, when it paused, time already paused. */
export interface TimerClock {
  startedAt: number
  pausedAt: number | null
  pausedMs: number
}

/** The running order's timer converted to this device's clock (`offset` = server minus device, ms). */
export function timerClock(r: RunOrder, offset = 0): TimerClock | null {
  if (!r.startedAt) return null
  return {
    startedAt: Date.parse(r.startedAt) - offset,
    pausedAt: r.pausedAt ? Date.parse(r.pausedAt) - offset : null,
    pausedMs: r.pausedMs ?? 0,
  }
}

/** Seconds of pitch time used so far. */
export function elapsedSeconds(t: TimerClock, now: number): number {
  return Math.max(0, Math.floor(((t.pausedAt ?? now) - t.startedAt - t.pausedMs) / 1000))
}
