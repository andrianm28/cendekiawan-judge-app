// Storage seam: an in-memory store for tests and local runs, DynamoDB in AWS.

import type { PartialSheet } from '../../web/src/domain/scoring'
import type { Deliberation } from '../../web/src/domain/deliberation'
import type { RunOrder } from '../../web/src/domain/runOrder'
import type { TieBreak, TieBreaks } from '../../web/src/domain/ties'
import type { CategoryId } from '../../web/src/domain/teams'

export interface StoredScore {
  judgeId: string
  teamId: string
  sheet: PartialSheet
  note: string
  status: 'draft' | 'submitted'
  version: number
  updatedAt: string
}

export interface JudgeAccount {
  id: string
  group: number
  name: string
  title?: string
  pinHash: string
}

export interface LoginFailures {
  /** Start of the counting window, ms since epoch. */
  since: number
  count: number
}

export interface AuditEntry {
  at: string
  actor: string
  action: string
  detail: Record<string, unknown>
}

export interface Store {
  getJudges(): Promise<JudgeAccount[]>
  putJudges(judges: JudgeAccount[]): Promise<void>
  getAdminPinHash(): Promise<string | undefined>
  putAdminPinHash(hash: string): Promise<void>

  getScore(judgeId: string, teamId: string): Promise<StoredScore | undefined>
  putScore(score: StoredScore): Promise<void>
  listScores(): Promise<StoredScore[]>

  getClosedGroups(): Promise<number[]>
  setGroupClosed(group: number, closed: boolean): Promise<void>

  getDeliberation(): Promise<Deliberation | undefined>
  putDeliberation(d: Deliberation): Promise<void>

  getRunOrder(): Promise<RunOrder | undefined>
  putRunOrder(r: RunOrder): Promise<void>

  getTieBreaks(): Promise<TieBreaks>
  putTieBreak(category: CategoryId, pick: TieBreak): Promise<void>

  /** Judges the operator marked absent: their sheets leave the averages, the lock and the ties. */
  getAbsent(): Promise<string[]>
  setAbsent(judgeId: string, absent: boolean): Promise<void>

  /** Wrong PINs in the current window, shared by every Lambda instance. */
  getLoginFailures(): Promise<LoginFailures | undefined>
  putLoginFailures(f: LoginFailures): Promise<void>

  /** Keep a copy of the event data before a reset, so a mistaken reset can be recovered. */
  archive(epoch: string, snapshot: Record<string, unknown>): Promise<void>

  touchPresence(judgeId: string, at: string): Promise<void>
  getPresence(): Promise<Record<string, string>>

  appendAudit(entry: AuditEntry): Promise<void>
  listAudit(): Promise<AuditEntry[]>

  /** Id of the current event data; changes on every reset so tablets drop their local copies. */
  getEpoch(): Promise<string | null>
  /**
   * Delete every score, tie pick, closed category, absent mark, presence, audit entry, the running
   * order and the deliberation, and set a new epoch. Judges, names and PINs stay.
   */
  resetEventData(epoch: string): Promise<void>
}

export function memoryStore(): Store {
  let judges: JudgeAccount[] = []
  let adminPin: string | undefined
  const scores = new Map<string, StoredScore>()
  const closed = new Set<number>()
  let deliberation: Deliberation | undefined
  let runOrder: RunOrder | undefined
  let ties: TieBreaks = {}
  let presence: Record<string, string> = {}
  const absent = new Set<string>()
  const archives = new Map<string, Record<string, unknown>>()
  let failures: LoginFailures | undefined
  const audit: AuditEntry[] = []
  let epoch: string | null = null
  const clone = <T>(x: T): T => structuredClone(x)
  return {
    getJudges: async () => clone(judges),
    putJudges: async (j) => void (judges = clone(j)),
    getAdminPinHash: async () => adminPin,
    putAdminPinHash: async (h) => void (adminPin = h),
    getScore: async (j, t) => clone(scores.get(`${j}#${t}`)),
    putScore: async (s) => void scores.set(`${s.judgeId}#${s.teamId}`, clone(s)),
    listScores: async () => [...scores.values()].map(clone),
    getClosedGroups: async () => [...closed].sort(),
    setGroupClosed: async (g, c) => void (c ? closed.add(g) : closed.delete(g)),
    getDeliberation: async () => clone(deliberation),
    putDeliberation: async (d) => void (deliberation = clone(d)),
    getRunOrder: async () => clone(runOrder),
    putRunOrder: async (r) => void (runOrder = clone(r)),
    getTieBreaks: async () => clone(ties),
    putTieBreak: async (c, p) => void (ties[c] = clone(p)),
    getAbsent: async () => [...absent].sort(),
    setAbsent: async (j, a) => void (a ? absent.add(j) : absent.delete(j)),
    archive: async (e, snap) => void archives.set(e, clone(snap)),
    getLoginFailures: async () => clone(failures),
    putLoginFailures: async (f) => void (failures = clone(f)),
    touchPresence: async (j, at) => void (presence[j] = at),
    getPresence: async () => ({ ...presence }),
    appendAudit: async (e) => void audit.push(clone(e)),
    listAudit: async () => audit.map(clone),
    getEpoch: async () => epoch,
    resetEventData: async (e) => {
      scores.clear()
      closed.clear()
      absent.clear()
      deliberation = undefined
      runOrder = undefined
      ties = {}
      presence = {}
      audit.length = 0
      epoch = e
    },
  }
}
