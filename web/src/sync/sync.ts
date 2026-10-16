// One sync round for a judge's tablet: upload every unsynced sheet, then take the
// server's view (closed groups, operator corrections). Taps are always saved on the
// tablet first, so a failed round just leaves records waiting for the next one.

import { currentCriteria } from '../domain/scoring'
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
  /** The operator marked this judge absent: their scores no longer count. */
  absent?: boolean
  /** The result is locked: every sheet is frozen. */
  locked?: boolean
  /** Sheets the server refused as invalid; they stay on the tablet and the rest keep syncing. */
  rejected?: number
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
    let rejected = 0
    for (const r of (await store.listForJudge(judgeId)).filter((x) => !x.synced)) {
      try {
        // A sheet saved under an older rubric may still hold a dropped criterion (V3).
        await api.saveScore({ ...r, sheet: currentCriteria(r.sheet) })
        await store.markSynced(judgeId, r.teamId, r.version)
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
        // 400/404: the server will never take this sheet. Keep it on the tablet, counted as
        // waiting, and go on with the others instead of stalling every sheet behind it.
        if (e.status === 400 || e.status === 404) {
          rejected++
          continue
        }
        // 409: the server holds a newer copy; 423: category closed, or the sheet was
        // submitted and the deliberation is not open. Either way the server copy wins
        // (here, or below for a closed category).
        if ((e.status === 409 || e.status === 423) && e.current && (await store.adopt(e.current as ServerScore, true))) replaced.push(r.teamId)
        else if (e.status !== 409 && e.status !== 423) throw e
      }
    }
    const judge = state.judges.find((j) => j.id === judgeId)
    const closed = (teamId: string) => {
      const t = TEAMS.find((x) => x.id === teamId)
      return !!t && closedGroups.includes(categoryOf(t.category).group)
    }
    const editable = !!state.runOrder?.deliberation && !state.locked
    for (const s of state.scores) {
      const frozen = closed(s.teamId) || (s.status === 'submitted' && !editable)
      if (await store.adopt(s, frozen)) replaced.push(s.teamId)
    }
    const waiting = (await store.listForJudge(judgeId)).filter((x) => !x.synced).length
    return {
      online: true, waiting, closedGroups, judge, replaced: [...new Set(replaced)], reset,
      runOrder: state.runOrder, clockOffset, ties: state.ties, absent: state.absent === true, locked: state.locked === true, rejected,
    }
  } catch (e) {
    const waiting = (await store.listForJudge(judgeId)).filter((x) => !x.synced).length
    if (e instanceof ApiError && e.status === 401) return { online: true, waiting, closedGroups, replaced, error: 'unauthorized' }
    return { online: false, waiting, closedGroups, replaced, error: e instanceof Error ? e.message : String(e) }
  }
}
