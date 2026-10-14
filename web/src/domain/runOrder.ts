// The running order: which team presents when. The operator sets it on the day and
// marks the team on stage; every judge's tablet lists teams in this order.

import { TEAMS } from './teams'

export interface RunOrder {
  /** Team ids, first to present first. */
  order: string[]
  /** Team presenting now, or null before the first pitch / after the last. */
  current: string | null
  /** When the operator started the 5-minute pitch timer for the current team (server clock). */
  startedAt: string | null
}

export const DEFAULT_RUN_ORDER: RunOrder = { order: TEAMS.map((t) => t.id), current: null, startedAt: null }

/** Keep only known teams, each once, and append any missing in showcase order. */
export function normalizeRunOrder(r: Partial<RunOrder> | null | undefined): RunOrder {
  const known = new Set(TEAMS.map((t) => t.id))
  const order = [...new Set((r?.order ?? []).filter((id) => known.has(id)))]
  for (const t of TEAMS) if (!order.includes(t.id)) order.push(t.id)
  const current = r?.current && known.has(r.current) ? r.current : null
  const startedAt = current && typeof r?.startedAt === 'string' && !Number.isNaN(Date.parse(r.startedAt)) ? r.startedAt : null
  return { order, current, startedAt }
}

export function moveInOrder(r: RunOrder, teamId: string, delta: number): RunOrder {
  const order = [...r.order]
  const i = order.indexOf(teamId)
  const j = i + delta
  if (i < 0 || j < 0 || j >= order.length) return r
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...r, order }
}

/** The team after (or before) the one presenting now; starts at the first team. */
export function stepCurrent(r: RunOrder, delta: 1 | -1): RunOrder {
  const i = r.current ? r.order.indexOf(r.current) : -1
  const j = r.current ? i + delta : delta > 0 ? 0 : -1
  return { ...r, current: j >= 0 && j < r.order.length ? r.order[j] : null, startedAt: null }
}
