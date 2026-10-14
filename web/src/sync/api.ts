// Thin client for the judging API. Without VITE_API_URL the app runs fully local
// (one tablet, IndexedDB only), which is also the fallback plan for the event.

import type { Deliberation } from '../domain/deliberation'
import type { RunOrder } from '../domain/runOrder'
import type { CategoryId } from '../domain/teams'
import type { TieBreak, TieBreaks, TieSummary } from '../domain/ties'
import type { Judge } from '../judges'
import type { ScoreRecord } from '../storage/scoreStore'

export const API_URL: string | undefined = import.meta.env.VITE_API_URL || undefined

export type ServerScore = Omit<ScoreRecord, 'synced'>

export interface Session {
  token: string
  role: 'judge' | 'admin'
  judge?: Judge
  /** The judge confirmed on this tablet that the name shown is theirs. */
  confirmed?: boolean
}

export interface AuditEntry {
  at: string
  actor: string
  action: string
  detail: Record<string, unknown>
}

export interface ServerState {
  judges: Judge[]
  closedGroups: number[]
  scores: ServerScore[]
  runOrder: RunOrder
  serverTime: string
  /** Changes when the operator resets the event data. */
  epoch: string | null
  /** Ties at the top of a fully scored category; a judge only gets their own category's. */
  ties: TieSummary[]
  tieBreaks?: TieBreaks
  presence?: Record<string, string>
  deliberation?: Deliberation | null
  /** The result is locked: every score is frozen. */
  locked?: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly current: unknown
  constructor(status: number, code: string, message: string, current?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.current = current
  }
}

export class Api {
  readonly base: string
  readonly token: string | undefined
  constructor(base: string, token?: string) {
    this.base = base.replace(/\/$/, '')
    this.token = token
  }

  withToken(token: string) {
    return new Api(this.base, token)
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, data?.code ?? 'error', data?.message ?? res.statusText, data?.current)
    return data as T
  }

  login = (pin: string) => this.call<Session>('POST', '/login', { pin })
  state = () => this.call<ServerState>('GET', '/state')
  saveScore = (r: Pick<ScoreRecord, 'teamId' | 'sheet' | 'note' | 'status' | 'version'>) =>
    this.call<ServerScore>('PUT', `/scores/${r.teamId}`, { sheet: r.sheet, note: r.note, status: r.status, version: r.version })
  correctScore = (judgeId: string, teamId: string, r: Pick<ScoreRecord, 'sheet' | 'note' | 'status'>, reason: string) =>
    this.call<ServerScore>('PUT', `/admin/scores/${judgeId}/${teamId}`, { ...r, reason })
  setGroupClosed = (group: number, closed: boolean) =>
    this.call<{ closedGroups: number[] }>('POST', `/admin/groups/${group}`, { closed })
  updateJudge = (id: string, change: { name?: string; title?: string; group?: number; pin?: string }) => this.call<Judge>('PUT', `/admin/judges/${id}`, change)
  pickTieWinner = (category: CategoryId, teamId: string) => this.call<TieBreak>('PUT', `/ties/${category}`, { teamId })
  putRunOrder = (body: { order?: string[]; current?: string | null; timer?: 'start' | 'reset' }) =>
    this.call<RunOrder>('PUT', '/admin/runorder', body)
  resetEventData = () => this.call<{ epoch: string; scores: number }>('POST', '/admin/reset', { confirm: 'RESET' })
  putDeliberation = (d: Deliberation) => this.call<Deliberation>('PUT', '/admin/deliberation', d)
  audit = () => this.call<AuditEntry[]>('GET', '/admin/audit')
}
