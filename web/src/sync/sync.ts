// One sync round for a judge's tablet: upload every unsynced sheet, then take the
// server's view (closed groups, operator corrections). Taps are always saved on the
// tablet first, so a failed round just leaves records waiting for the next one.

import { CATEGORIES, categoryOf, TEAMS } from '../domain/teams'
import type { RunOrder } from '../domain/runOrder'
import type { TieSummary } from '../domain/ties'
import type { Judge } from '../judges'
import type { ScoreStore } from '../storage/scoreStore'
import { ApiError, type Api, type ServerScore } from './api'

export interface SyncResult {
  online: boolean
  waiting: number
  closedGroups: number[]
  judge?: Judge
  /** Sheets replaced by the server copy (operator correction or closed category). */
  replaced: string[]
  runOrder?: RunOrder
  /** Server clock minus this tablet's clock, in ms, so the pitch timer matches the operator's. */
  clockOffset?: number
  ties?: TieSummary[]
  /** The operator reset the event data and this tablet dropped its local records. */
  reset?: boolean
  error?: string
}

export async function syncJudge(api: Api, store: ScoreStore, judgeId: string): Promise<SyncResult> {
  const replaced: string[] = []
  let closedGroups: number[] = []
  try {
    // Read the server first: after an operator reset, local records belong to the
    // rehearsal and must be dropped before anything is uploaded.
    const asked = Date.now()
    const state = await api.state()
    const clockOffset = Date.parse(state.serverTime) - (asked + Date.now()) / 2
    const epoch = state.epoch ?? null
    const reset = epoch !== (await store.getEpoch())
    if (reset) await store.resetTo(epoch)

    // A locked result freezes every category, so the tablet treats them all as closed.
    closedGroups = state.locked ? CATEGORIES.map((c) => c.group) : state.closedGroups
    for (const r of (await store.listForJudge(judgeId)).filter((x) => !x.synced)) {
      try {
        await api.saveScore(r)
        await store.markSynced(judgeId, r.teamId, r.version)
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
        // 409: the server holds a newer copy; 423: category closed. Either way the
        // server copy wins (below, or on the next round).
        if (e.status === 409 && e.current && (await store.adopt(e.current as ServerScore, true))) replaced.push(r.teamId)
        else if (e.status !== 423) throw e
      }
    }
    const judge = state.judges.find((j) => j.id === judgeId)
    const closed = (teamId: string) => {
      const t = TEAMS.find((x) => x.id === teamId)
      return !!t && closedGroups.includes(categoryOf(t.category).group)
    }
    for (const s of state.scores) {
      if (await store.adopt(s, closed(s.teamId))) replaced.push(s.teamId)
    }
    const waiting = (await store.listForJudge(judgeId)).filter((x) => !x.synced).length
    return {
      online: true, waiting, closedGroups, judge, replaced: [...new Set(replaced)], reset,
      runOrder: state.runOrder, clockOffset, ties: state.ties,
    }
  } catch (e) {
    const waiting = (await store.listForJudge(judgeId)).filter((x) => !x.synced).length
    if (e instanceof ApiError && e.status === 401) return { online: true, waiting, closedGroups, replaced, error: 'unauthorized' }
    return { online: false, waiting, closedGroups, replaced, error: e instanceof Error ? e.message : String(e) }
  }
}
