// Server rules for the judging API. Pure apart from the Store, so it is tested
// without AWS.

import type { Deliberation } from '../../web/src/domain/deliberation'
import { CRITERIA, isComplete, type PartialSheet } from '../../web/src/domain/scoring'
import { normalizeRunOrder, type RunOrder } from '../../web/src/domain/runOrder'
import { CATEGORIES, categoryOf, TEAMS, type CategoryId } from '../../web/src/domain/teams'
import { categoryTies, submittedSheets } from '../../web/src/domain/ties'
import { proposeRanks, rankCategory } from '../../web/src/domain/ranking'
import { hashPin, signToken, verifyPin, type Session } from './auth'
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

/**
 * An operator correction jumps the sheet's version this far ahead, so taps a tablet
 * made offline before it (a sheet holds a few dozen taps at most) arrive as stale and
 * the tablet takes the correction instead of silently overwriting it.
 */
export const CORRECTION_STEP = 1000

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
          judge: { id: j.id, group: j.group, name: j.name, title: j.title ?? '' },
        }
      }
    }
    throw new ApiError(401, 'bad_pin', 'Wrong PIN')
  }

  /**
   * Everything a screen needs in one call. Judges get their own sheets, the running
   * order, and any tie in the category they own (averages only, not other judges'
   * sheets); the admin gets everything.
   */
  async state(s: Session) {
    const [judges, closedGroups, scores, runOrder, picks] = await Promise.all([
      this.store.getJudges(),
      this.store.getClosedGroups(),
      this.store.listScores(),
      this.store.getRunOrder(),
      this.store.getTieBreaks(),
    ])
    const publicJudges = judges.map(({ id, group, name, title }) => ({ id, group, name, title: title ?? '' }))
    const ties = categoryTies(scores, judges.length, picks)
    const deliberation = (await this.store.getDeliberation()) ?? null
    const common = {
      closedGroups,
      // Tablets freeze every category once the result is locked.
      locked: !!deliberation?.lockedAt,
      runOrder: normalizeRunOrder(runOrder),
      serverTime: this.now().toISOString(),
      epoch: await this.store.getEpoch(),
    }
    if (s.role === 'judge') {
      await this.store.touchPresence(s.sub, this.now().toISOString())
      const me = publicJudges.find((j) => j.id === s.sub)
      return {
        ...common,
        judges: publicJudges.filter((j) => j.id === s.sub),
        scores: scores.filter((x) => x.judgeId === s.sub),
        ties: ties.filter((t) => categoryOf(t.category).group === me?.group),
      }
    }
    return {
      ...common,
      judges: publicJudges,
      scores,
      ties,
      tieBreaks: picks,
      presence: await this.store.getPresence(),
      deliberation,
    }
  }

  async saveScore(s: Session, teamId: string, input: ScoreInput): Promise<StoredScore> {
    if (s.role !== 'judge') throw new ApiError(403, 'forbidden', 'Only judges submit scores; use a correction')
    // Every judge scores every team (ADR 0003).
    const judge = (await this.store.getJudges()).find((j) => j.id === s.sub)
    const team = TEAMS.find((t) => t.id === teamId)
    if (!judge || !team) throw new ApiError(404, 'not_found', 'Unknown judge or team')
    validate(input)
    await this.requireUnlocked()
    if ((await this.store.getClosedGroups()).includes(categoryOf(team.category).group)) {
      throw new ApiError(423, 'group_closed', 'This category is closed. Ask the operator to change a score.')
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

  /**
   * The same checks the Lock button makes, on the server: every judge submitted every
   * team, no category tie is waiting for its judge, and the order holds exactly the
   * five current category winners.
   */
  private async requireLockable(d: Deliberation) {
    const [judges, scores, picks] = await Promise.all([this.store.getJudges(), this.store.listScores(), this.store.getTieBreaks()])
    const sheets = submittedSheets(scores)
    const submitted = [...sheets.values()].reduce((a, x) => a + x.length, 0)
    if (submitted < TEAMS.length * judges.length) throw new ApiError(409, 'not_all_in', 'Every judge must submit every team before the result is locked')
    const standings = CATEGORIES.map((c) => rankCategory(c.id, TEAMS, sheets, picks[c.id]?.teamId))
    if (standings.some((s) => s.tiedAtTop)) throw new ApiError(409, 'tie_open', 'A category tie still needs its winner')
    const winners = proposeRanks(standings).map((r) => r.winner.team.id)
    const fits = d.order.length === winners.length && winners.every((id) => d.order.includes(id))
    if (!fits) throw new ApiError(409, 'stale', 'The category winners changed; reload before locking')
  }

  /** Once the result is locked the scores behind it are frozen too, or a late change could move a winner. */
  private async requireUnlocked() {
    if ((await this.store.getDeliberation())?.lockedAt) throw new ApiError(423, 'locked', 'The result is locked. Scores can no longer change.')
  }

  /** Operator change to a score after the fact, always with a reason in the audit log. */
  async correctScore(s: Session, judgeId: string, teamId: string, input: Omit<ScoreInput, 'version'>, reason: string) {
    requireAdmin(s)
    if (!reason.trim()) throw new ApiError(400, 'reason_required', 'A reason is required')
    validate({ ...input, version: 0 })
    await this.requireUnlocked()
    if (!(await this.store.getJudges()).some((j) => j.id === judgeId) || !TEAMS.some((t) => t.id === teamId)) {
      throw new ApiError(404, 'not_found', 'Unknown judge or team')
    }
    // No sheet yet (a tablet failed before saving): the operator enters it from the paper backup.
    const prev = (await this.store.getScore(judgeId, teamId)) ?? { judgeId, teamId, sheet: {}, note: '', status: 'draft' as const, version: 0, updatedAt: '' }
    const next: StoredScore = { ...prev, ...input, version: prev.version + CORRECTION_STEP, updatedAt: this.now().toISOString() }
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

  /**
   * The operator edits a judge: name, role/organisation, the category they own (if another
   * judge owns it, the two swap) and, optionally, a new PIN. PINs stay unique across all
   * judges and the operator; only the hash is stored and the audit never holds the PIN.
   */
  async updateJudge(s: Session, judgeId: string, body: { name?: unknown; title?: unknown; group?: unknown; pin?: unknown }) {
    requireAdmin(s)
    const judges = await this.store.getJudges()
    const j = judges.find((x) => x.id === judgeId)
    if (!j) throw new ApiError(404, 'not_found', 'Unknown judge')
    const before = { name: j.name, title: j.title ?? '', group: j.group }

    if (body.name !== undefined) {
      const clean = String(body.name).trim().slice(0, 60)
      if (!clean) throw new ApiError(400, 'bad_name', 'Name is required')
      j.name = clean
    }
    if (body.title !== undefined) j.title = String(body.title).trim().slice(0, 80)
    let swappedWith: string | undefined
    if (body.group !== undefined && body.group !== j.group) {
      const group = Number(body.group)
      if (!Number.isInteger(group) || group < 1 || group > 5) throw new ApiError(400, 'bad_group', 'Category must be 1–5')
      const other = judges.find((x) => x.id !== j.id && x.group === group)
      if (other) {
        other.group = j.group
        swappedWith = other.id
      }
      j.group = group
    }
    const pinChanged = body.pin !== undefined && body.pin !== ''
    if (pinChanged) {
      const pin = String(body.pin)
      if (!/^\d{6,8}$/.test(pin)) throw new ApiError(400, 'bad_pin', 'PIN must be 6 to 8 digits')
      const admin = await this.store.getAdminPinHash()
      const taken = judges.some((x) => x.id !== j.id && verifyPin(pin, x.pinHash)) || (admin !== undefined && verifyPin(pin, admin))
      if (taken) throw new ApiError(409, 'pin_taken', 'That PIN is already used by someone else')
      j.pinHash = hashPin(pin)
    }
    await this.store.putJudges(judges)
    await this.audit('rename_judge', {
      judgeId, before: before.name, after: j.name, title: j.title ?? '',
      ...(before.group !== j.group ? { fromGroup: before.group, toGroup: j.group, swappedWith } : {}),
      ...(pinChanged ? { pinChanged: true } : {}),
    })
    return { id: j.id, group: j.group, name: j.name, title: j.title ?? '' }
  }

  async putDeliberation(s: Session, d: Deliberation) {
    requireAdmin(s)
    const prev = await this.store.getDeliberation()
    if (prev?.lockedAt) throw new ApiError(423, 'locked', 'The result is locked')
    const prevLog = prev?.log.length ?? 0
    if (d.log.length < prevLog) throw new ApiError(409, 'stale', 'Deliberation changed on another device', prev)
    if (d.lockedAt) await this.requireLockable(d)
    await this.store.putDeliberation(d)
    for (const change of d.log.slice(prevLog)) await this.audit('reorder_rank', { ...change })
    if (d.lockedAt) await this.audit('lock_result', { order: d.order })
    return d
  }

  /**
   * The operator sets the running order, the team on stage and the pitch timer.
   * `timer: 'start'` stamps the server time, so every tablet counts from the same moment.
   */
  async putRunOrder(s: Session, body: { order?: string[]; current?: string | null; timer?: 'start' | 'reset' }) {
    requireAdmin(s)
    const prev = normalizeRunOrder(await this.store.getRunOrder())
    const next: RunOrder = normalizeRunOrder({ order: body.order ?? prev.order, current: body.current === undefined ? prev.current : body.current })
    next.startedAt = next.current !== prev.current ? null : prev.startedAt
    if (body.timer === 'start' && next.current) next.startedAt = this.now().toISOString()
    if (body.timer === 'reset') next.startedAt = null
    await this.store.putRunOrder(next)
    if (next.order.join() !== prev.order.join()) await this.audit('set_order', { order: next.order })
    if (next.current !== prev.current) await this.audit('now_presenting', { teamId: next.current })
    if (next.startedAt && next.startedAt !== prev.startedAt) await this.audit('start_timer', { teamId: next.current })
    return next
  }

  /** The judge who owns a category (or the operator) picks the winner of a tie at its top. */
  async pickTieWinner(s: Session, category: string, teamId: string) {
    const cat = CATEGORIES.find((c) => c.id === category)
    if (!cat) throw new ApiError(404, 'not_found', 'Unknown category')
    const judges = await this.store.getJudges()
    if (s.role === 'judge' && judges.find((j) => j.id === s.sub)?.group !== cat.group) {
      throw new ApiError(403, 'forbidden', 'Only the judge who owns this category can break its tie')
    }
    if ((await this.store.getDeliberation())?.lockedAt) throw new ApiError(423, 'locked', 'The result is locked')
    const tie = categoryTies(await this.store.listScores(), judges.length, {}).find((t) => t.category === category)
    if (!tie) throw new ApiError(409, 'no_tie', 'There is no tie to break in this category (or scoring is not complete)')
    if (!tie.tied.some((t) => t.teamId === teamId)) throw new ApiError(400, 'not_tied', 'That team is not one of the tied teams')
    const pick = { teamId, by: s.role === 'admin' ? 'admin' : s.sub, at: this.now().toISOString() }
    await this.store.putTieBreak(category as CategoryId, pick)
    await this.audit('tie_pick', { category, teamId, tied: tie.tied.map((t) => t.teamId) }, pick.by)
    return pick
  }

  /**
   * Wipe the event data after a rehearsal (UAT): scores, ties, closed categories, running
   * order, deliberation and the change log. Judges, names and PINs stay. Tablets see the
   * new epoch on their next sync and clear their local copies.
   */
  async resetEventData(s: Session, confirm: string) {
    requireAdmin(s)
    if (confirm !== 'RESET') throw new ApiError(400, 'confirm_required', 'Type RESET to confirm')
    const counts = { scores: (await this.store.listScores()).length }
    const epoch = this.now().toISOString()
    await this.store.resetEventData(epoch)
    await this.audit('reset', counts)
    return { epoch, ...counts }
  }

  async listAudit(s: Session) {
    requireAdmin(s)
    return this.store.listAudit()
  }

  private audit(action: string, detail: Record<string, unknown>, actor = 'admin') {
    return this.store.appendAudit({ at: this.now().toISOString(), actor, action, detail })
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
