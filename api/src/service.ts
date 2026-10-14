// Server rules for the judging API. Pure apart from the Store, so it is tested
// without AWS.

import type { Deliberation } from '../../web/src/domain/deliberation'
import { CRITERIA, isComplete, type PartialSheet } from '../../web/src/domain/scoring'
import { categoryOf, TEAMS } from '../../web/src/domain/teams'
import { signToken, verifyPin, type Session } from './auth'
import type { Store, StoredScore } from './store'

export class ApiError extends Error {
  status: number
  code: string
  extra?: unknown
  constructor(status: number, code: string, message: string, extra?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

const SESSION_HOURS = 12

export interface ScoreInput {
  sheet: PartialSheet
  note: string
  status: 'draft' | 'submitted'
  /** The tablet's version counter for this sheet; must increase. */
  version: number
}

export class JudgingService {
  private store: Store
  private secret: string
  private now: () => Date

  constructor(store: Store, secret: string, now: () => Date = () => new Date()) {
    this.store = store
    this.secret = secret
    this.now = now
  }

  async login(pin: string) {
    if (!/^\d{4,8}$/.test(pin)) throw new ApiError(401, 'bad_pin', 'Wrong PIN')
    const exp = Math.floor(this.now().getTime() / 1000) + SESSION_HOURS * 3600
    const admin = await this.store.getAdminPinHash()
    if (admin && verifyPin(pin, admin)) {
      return { token: signToken({ role: 'admin', sub: 'admin', exp }, this.secret), role: 'admin' as const }
    }
    for (const j of await this.store.getJudges()) {
      if (verifyPin(pin, j.pinHash)) {
        await this.store.touchPresence(j.id, this.now().toISOString())
        return {
          token: signToken({ role: 'judge', sub: j.id, exp }, this.secret),
          role: 'judge' as const,
          judge: { id: j.id, group: j.group, name: j.name },
        }
      }
    }
    throw new ApiError(401, 'bad_pin', 'Wrong PIN')
  }

  /** Everything a screen needs in one call: judges get their own sheets, the admin gets all. */
  async state(s: Session) {
    const [judges, closedGroups, scores] = await Promise.all([
      this.store.getJudges(),
      this.store.getClosedGroups(),
      this.store.listScores(),
    ])
    const publicJudges = judges.map(({ id, group, name }) => ({ id, group, name }))
    if (s.role === 'judge') {
      await this.store.touchPresence(s.sub, this.now().toISOString())
      return {
        judges: publicJudges.filter((j) => j.id === s.sub),
        closedGroups,
        scores: scores.filter((x) => x.judgeId === s.sub),
      }
    }
    return {
      judges: publicJudges,
      closedGroups,
      scores,
      presence: await this.store.getPresence(),
      deliberation: (await this.store.getDeliberation()) ?? null,
    }
  }

  async saveScore(s: Session, teamId: string, input: ScoreInput): Promise<StoredScore> {
    if (s.role !== 'judge') throw new ApiError(403, 'forbidden', 'Only judges submit scores; use a correction')
    const judge = (await this.store.getJudges()).find((j) => j.id === s.sub)
    const team = TEAMS.find((t) => t.id === teamId)
    if (!judge || !team) throw new ApiError(404, 'not_found', 'Unknown judge or team')
    if (categoryOf(team.category).group !== judge.group) throw new ApiError(403, 'forbidden', 'Team is not in your group')
    validate(input)
    if ((await this.store.getClosedGroups()).includes(judge.group)) {
      throw new ApiError(423, 'group_closed', 'This group is closed. Ask the operator to change a score.')
    }
    const prev = await this.store.getScore(judge.id, teamId)
    if (prev && input.version <= prev.version) {
      throw new ApiError(409, 'stale', 'A newer version is already saved', prev)
    }
    const next: StoredScore = {
      judgeId: judge.id,
      teamId,
      sheet: input.sheet,
      note: input.note,
      status: input.status,
      version: input.version,
      updatedAt: this.now().toISOString(),
    }
    await this.store.putScore(next)
    await this.store.touchPresence(judge.id, next.updatedAt)
    return next
  }

  /** Operator change to a score after the fact, always with a reason in the audit log. */
  async correctScore(s: Session, judgeId: string, teamId: string, input: Omit<ScoreInput, 'version'>, reason: string) {
    requireAdmin(s)
    if (!reason.trim()) throw new ApiError(400, 'reason_required', 'A reason is required')
    validate({ ...input, version: 0 })
    const prev = await this.store.getScore(judgeId, teamId)
    if (!prev) throw new ApiError(404, 'not_found', 'No score to correct')
    const next: StoredScore = { ...prev, ...input, version: prev.version + 1, updatedAt: this.now().toISOString() }
    await this.store.putScore(next)
    await this.audit('correct_score', { judgeId, teamId, reason: reason.trim(), before: prev, after: next })
    return next
  }

  async setGroupClosed(s: Session, group: number, closed: boolean) {
    requireAdmin(s)
    if (!Number.isInteger(group) || group < 1 || group > 5) throw new ApiError(400, 'bad_group', 'Group must be 1–5')
    await this.store.setGroupClosed(group, closed)
    await this.audit(closed ? 'close_group' : 'open_group', { group })
    return { closedGroups: await this.store.getClosedGroups() }
  }

  async renameJudge(s: Session, judgeId: string, name: string) {
    requireAdmin(s)
    const clean = name.trim().slice(0, 60)
    if (!clean) throw new ApiError(400, 'bad_name', 'Name is required')
    const judges = await this.store.getJudges()
    const j = judges.find((x) => x.id === judgeId)
    if (!j) throw new ApiError(404, 'not_found', 'Unknown judge')
    const before = j.name
    j.name = clean
    await this.store.putJudges(judges)
    await this.audit('rename_judge', { judgeId, before, after: clean })
    return { id: j.id, group: j.group, name: j.name }
  }

  async putDeliberation(s: Session, d: Deliberation) {
    requireAdmin(s)
    const prev = await this.store.getDeliberation()
    if (prev?.lockedAt) throw new ApiError(423, 'locked', 'The result is locked')
    const prevLog = prev?.log.length ?? 0
    if (d.log.length < prevLog) throw new ApiError(409, 'stale', 'Deliberation changed on another device', prev)
    await this.store.putDeliberation(d)
    for (const change of d.log.slice(prevLog)) await this.audit('reorder_rank', { ...change })
    if (d.lockedAt) await this.audit('lock_result', { order: d.order })
    return d
  }

  async listAudit(s: Session) {
    requireAdmin(s)
    return this.store.listAudit()
  }

  private audit(action: string, detail: Record<string, unknown>) {
    return this.store.appendAudit({ at: this.now().toISOString(), actor: 'admin', action, detail })
  }
}

function requireAdmin(s: Session) {
  if (s.role !== 'admin') throw new ApiError(403, 'forbidden', 'Operator only')
}

function validate(input: ScoreInput) {
  const keys = Object.keys(input.sheet ?? {})
  const ok =
    keys.every((k) => (CRITERIA as readonly string[]).includes(k)) &&
    Object.values(input.sheet).every((v) => v === 1 || v === 2 || v === 3 || v === 4) &&
    typeof input.note === 'string' &&
    input.note.length <= 200 &&
    (input.status === 'draft' || input.status === 'submitted') &&
    Number.isInteger(input.version)
  if (!ok) throw new ApiError(400, 'bad_score', 'Invalid score sheet')
  if (input.status === 'submitted' && !isComplete(input.sheet)) {
    throw new ApiError(400, 'incomplete', 'All 9 criteria are needed to submit')
  }
}
