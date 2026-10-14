// Scores live on the tablet first (IndexedDB) so a dropped Wi-Fi never loses a tap.
// The sync (src/sync) pushes records with synced === false and adopts newer server copies.

import { openDB, type IDBPDatabase } from 'idb'
import { EMPTY_DELIBERATION, type Deliberation } from '../domain/deliberation'
import type { PartialSheet } from '../domain/scoring'

export type ScoreStatus = 'draft' | 'submitted'

export interface ScoreRecord {
  teamId: string
  judgeId: string
  sheet: PartialSheet
  note: string
  status: ScoreStatus
  version: number
  updatedAt: string
  synced: boolean
}

const DB_NAME = 'cendekiawan-judge'
const STORE = 'scores'
const META = 'meta'

export class ScoreStore {
  private db: IDBPDatabase

  private constructor(db: IDBPDatabase) {
    this.db = db
  }

  static async open(name = DB_NAME): Promise<ScoreStore> {
    const db = await openDB(name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const s = db.createObjectStore(STORE, { keyPath: ['judgeId', 'teamId'] })
          s.createIndex('judgeId', 'judgeId')
        }
        if (oldVersion < 2) db.createObjectStore(META)
      },
    })
    return new ScoreStore(db)
  }

  get(judgeId: string, teamId: string): Promise<ScoreRecord | undefined> {
    return this.db.get(STORE, [judgeId, teamId])
  }

  listForJudge(judgeId: string): Promise<ScoreRecord[]> {
    return this.db.getAllFromIndex(STORE, 'judgeId', judgeId)
  }

  listAll(): Promise<ScoreRecord[]> {
    return this.db.getAll(STORE)
  }

  /** Save a change; bumps the version and marks it for sync. */
  async save(
    judgeId: string,
    teamId: string,
    change: Partial<Pick<ScoreRecord, 'sheet' | 'note' | 'status'>>,
    now: Date = new Date(),
  ): Promise<ScoreRecord> {
    const tx = this.db.transaction(STORE, 'readwrite')
    const prev: ScoreRecord | undefined = await tx.store.get([judgeId, teamId])
    const next: ScoreRecord = {
      teamId,
      judgeId,
      sheet: { ...prev?.sheet, ...change.sheet },
      note: change.note ?? prev?.note ?? '',
      status: change.status ?? prev?.status ?? 'draft',
      version: (prev?.version ?? 0) + 1,
      updatedAt: now.toISOString(),
      synced: false,
    }
    await tx.store.put(next)
    await tx.done
    return next
  }

  /** Mark a record uploaded, unless the judge changed it again while the upload was in flight. */
  async markSynced(judgeId: string, teamId: string, version: number): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite')
    const r: ScoreRecord | undefined = await tx.store.get([judgeId, teamId])
    if (r && r.version === version) await tx.store.put({ ...r, synced: true })
    await tx.done
  }

  /**
   * Take the server's copy when it is newer than ours (an operator correction, or the
   * judge's sheet from another tablet). `force` takes it regardless, for closed groups.
   */
  async adopt(server: Omit<ScoreRecord, 'synced'>, force = false): Promise<boolean> {
    const tx = this.db.transaction(STORE, 'readwrite')
    const local: ScoreRecord | undefined = await tx.store.get([server.judgeId, server.teamId])
    const take = force ? !local || local.version !== server.version || !local.synced : !local || server.version > local.version
    if (take) await tx.store.put({ ...server, synced: true })
    await tx.done
    return take
  }

  async getDeliberation(): Promise<Deliberation> {
    return (await this.db.get(META, 'deliberation')) ?? EMPTY_DELIBERATION
  }

  async saveDeliberation(d: Deliberation): Promise<void> {
    await this.db.put(META, d, 'deliberation')
  }

  close(): void {
    this.db.close()
  }
}
