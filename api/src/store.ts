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
  pinHash: string
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

  touchPresence(judgeId: string, at: string): Promise<void>
  getPresence(): Promise<Record<string, string>>

  appendAudit(entry: AuditEntry): Promise<void>
  listAudit(): Promise<AuditEntry[]>
}

export function memoryStore(): Store {
  let judges: JudgeAccount[] = []
  let adminPin: string | undefined
  const scores = new Map<string, StoredScore>()
  const closed = new Set<number>()
  let deliberation: Deliberation | undefined
  let runOrder: RunOrder | undefined
  const ties: TieBreaks = {}
  const presence: Record<string, string> = {}
  const audit: AuditEntry[] = []
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
    touchPresence: async (j, at) => void (presence[j] = at),
    getPresence: async () => ({ ...presence }),
    appendAudit: async (e) => void audit.push(clone(e)),
    listAudit: async () => audit.map(clone),
  }
}
