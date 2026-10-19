// DynamoDB single-table store. Every item is tiny and the whole event is ~100 score
// sheets, so each list is one Query on its partition.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'node:crypto'
import type { Deliberation } from '../../web/src/domain/deliberation'
import type { RunOrder } from '../../web/src/domain/runOrder'
import type { TieBreak } from '../../web/src/domain/ties'
import type { AuditEntry, JudgeAccount, LoginFailures, Store, StoredScore } from './store'

/** Sort key of the shared wrong-PIN counter (a count and a window start, no PINs). */
const WRONG_PINS = 'wrong-pin-count'

export function dynamoStore(table: string, client = DynamoDBDocumentClient.from(new DynamoDBClient({}))): Store {
  const get = async <T>(pk: string, sk: string) =>
    ((await client.send(new GetCommand({ TableName: table, Key: { pk, sk }, ConsistentRead: true }))).Item?.value as T | undefined)
  const put = (pk: string, sk: string, value: unknown) =>
    client.send(new PutCommand({ TableName: table, Item: { pk, sk, value } })).then(() => undefined)
  const del = (pk: string, sk: string) => client.send(new DeleteCommand({ TableName: table, Key: { pk, sk } })).then(() => undefined)
  const keys = async (pk: string) => {
    const out: string[] = []
    let start: Record<string, unknown> | undefined
    do {
      const r = await client.send(new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ProjectionExpression: 'sk',
        ConsistentRead: true,
        ExclusiveStartKey: start,
      }))
      out.push(...(r.Items ?? []).map((i) => i.sk as string))
      start = r.LastEvaluatedKey
    } while (start)
    return out
  }
  const query = async <T>(pk: string) => {
    const items: T[] = []
    let start: Record<string, unknown> | undefined
    do {
      const r = await client.send(new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ExclusiveStartKey: start,
        ConsistentRead: true,
      }))
      items.push(...(r.Items ?? []).map((i) => i.value as T))
      start = r.LastEvaluatedKey
    } while (start)
    return items
  }

  return {
    getJudges: async () => (await get<JudgeAccount[]>('META', 'judges')) ?? [],
    putJudges: (j) => put('META', 'judges', j),
    getAdminPinHash: () => get<string>('META', 'admin'),
    putAdminPinHash: (h) => put('META', 'admin', h),
    getScore: (j, t) => get<StoredScore>('SCORE', `${j}#${t}`),
    putScore: (s) => put('SCORE', `${s.judgeId}#${s.teamId}`, s),
    listScores: () => query<StoredScore>('SCORE'),
    getClosedGroups: async () => (await query<{ group: number; closed: boolean }>('GROUP')).filter((g) => g.closed).map((g) => g.group).sort(),
    setGroupClosed: (group, closed) => put('GROUP', String(group), { group, closed }),
    getDeliberation: () => get<Deliberation>('META', 'deliberation'),
    putDeliberation: (d) => put('META', 'deliberation', d),
    getRunOrder: () => get<RunOrder>('META', 'runorder'),
    putRunOrder: (r) => put('META', 'runorder', r),
    getTieBreaks: async () => Object.fromEntries((await query<TieBreak & { category: string }>('TIE')).map(({ category, ...p }) => [category, p])),
    putTieBreak: (category, p) => put('TIE', category, { ...p, category }),
    getAbsent: async () => (await query<{ judgeId: string; absent: boolean }>('ABSENT')).filter((a) => a.absent).map((a) => a.judgeId).sort(),
    setAbsent: (judgeId, absent) => put('ABSENT', judgeId, { judgeId, absent }),
    getLoginFailures: () => get<LoginFailures>('META', WRONG_PINS),
    putLoginFailures: (f) => put('META', WRONG_PINS, f),
    archive: (epoch, snapshot) => put('ARCHIVE', epoch, JSON.stringify(snapshot)),
    touchPresence: (j, at) => put('PRESENCE', j, { judgeId: j, at }),
    getPresence: async () => Object.fromEntries((await query<{ judgeId: string; at: string }>('PRESENCE')).map((p) => [p.judgeId, p.at])),
    appendAudit: (e: AuditEntry) => put('AUDIT', `${e.at}#${randomUUID()}`, e),
    listAudit: () => query<AuditEntry>('AUDIT'),
    getEpoch: async () => (await get<string>('META', 'epoch')) ?? null,
    resetEventData: async (epoch) => {
      // The new epoch goes first, so a tablet upload during the deletes is refused (or, if it
      // passed the check just before, is stamped with the old epoch and ignored).
      await put('META', 'epoch', epoch)
      // A few hundred small items at most; plain deletes keep this simple.
      for (const pk of ['SCORE', 'TIE', 'GROUP', 'ABSENT', 'PRESENCE', 'AUDIT']) {
        for (const sk of await keys(pk)) await del(pk, sk)
      }
      await del('META', 'deliberation')
      await del('META', 'runorder')
    },
  }
}
