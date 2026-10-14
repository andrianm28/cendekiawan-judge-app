// Scores live on the tablet first (IndexedDB) so a dropped Wi-Fi never loses a tap.
// The sync to the backend (later) reads records with synced === false.

import { openDB, type IDBPDatabase } from 'idb'
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

export class ScoreStore {
  private db: IDBPDatabase

  private constructor(db: IDBPDatabase) {
    this.db = db
  }

  static async open(name = DB_NAME): Promise<ScoreStore> {
    const db = await openDB(name, 1, {
      upgrade(db) {
        const s = db.createObjectStore(STORE, { keyPath: ['judgeId', 'teamId'] })
        s.createIndex('judgeId', 'judgeId')
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

  close(): void {
    this.db.close()
  }
}
