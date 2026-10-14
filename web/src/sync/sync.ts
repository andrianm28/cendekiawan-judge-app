// One sync round for a judge's tablet: upload every unsynced sheet, then take the
// server's view (closed groups, operator corrections). Taps are always saved on the
// tablet first, so a failed round just leaves records waiting for the next one.

import { categoryOf, TEAMS } from '../domain/teams'
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
  error?: string
}

export async function syncJudge(api: Api, store: ScoreStore, judgeId: string): Promise<SyncResult> {
  const replaced: string[] = []
  let closedGroups: number[] = []
  try {
    for (const r of (await store.listForJudge(judgeId)).filter((x) => !x.synced)) {
      try {
        await api.saveScore(r)
        await store.markSynced(judgeId, r.teamId, r.version)
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
        // 409: the server holds a newer copy; 423: group closed. Either way the
        // server copy wins and comes down in the pull below.
        if (e.status === 409 && e.current && (await store.adopt(e.current as ServerScore, true))) replaced.push(r.teamId)
        else if (e.status !== 423) throw e
      }
    }
    const asked = Date.now()
    const state = await api.state()
    const clockOffset = Date.parse(state.serverTime) - (asked + Date.now()) / 2
    closedGroups = state.closedGroups
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
      online: true, waiting, closedGroups, judge, replaced: [...new Set(replaced)],
      runOrder: state.runOrder, clockOffset, ties: state.ties,
    }
  } catch (e) {
    const waiting = (await store.listForJudge(judgeId)).filter((x) => !x.synced).length
    if (e instanceof ApiError && e.status === 401) return { online: true, waiting, closedGroups, replaced, error: 'unauthorized' }
    return { online: false, waiting, closedGroups, replaced, error: e instanceof Error ? e.message : String(e) }
  }
}
