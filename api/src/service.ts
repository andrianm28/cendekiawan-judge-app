// Server rules for the judging API. Pure apart from the Store, so it is tested
// without AWS.

import { keepsScoreOrder, type Deliberation } from '../../web/src/domain/deliberation'
import { CRITERIA, isComplete, type PartialSheet } from '../../web/src/domain/scoring'
import { canPutOnStage, normalizeRunOrder, sameCategoryLayout, type RunOrder } from '../../web/src/domain/runOrder'
import { CATEGORIES, categoryOf, TEAMS, type CategoryId } from '../../web/src/domain/teams'
import { categoryTies, submittedSheets } from '../../web/src/domain/ties'
import { proposeRanks, rankCategory } from '../../web/src/domain/ranking'
import { hashPin, pinKey, signToken, verifyPin, type Session } from './auth'
import type { JudgeAccount, Store, StoredScore } from './store'

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

/**
 * A login does not run out before the event, so judges can try the app days ahead.
 * It ends when the operator gives that judge (or the operator) a new PIN.
 */
const SESSION_DAYS = 365

/**
 * An operator correction jumps the sheet's version this far ahead, so taps a tablet
 * made offline before it (a sheet holds a few dozen taps at most) arrive as stale and
 * the tablet takes the correction instead of silently overwriting it.
 */
export const CORRECTION_STEP = 1000

/** Wrong PINs allowed per window before every login pauses until the window ends. */
export const LOGIN_MAX_FAILURES = 20
const LOGIN_WINDOW_MS = 15 * 60_000

/** Highest sheet version accepted: far above any tablet's tap count plus corrections. */
const MAX_VERSION = 1_000_000_000

/** What the operator types to reset after the result has been locked. */
export const RESET_LOCKED = 'RESET LOCKED RESULT'

/** Archive snapshot size limit, under DynamoDB's 400 KB item limit. */
const ARCHIVE_LIMIT = 350_000

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

  /**
   * The judges who score: everyone the operator has not marked absent. An absent judge's
   * sheets leave the averages, the lock check and the ties, so every team is judged by the
   * same panel.
   */
  private async panel() {
    const [judges, absent, scores] = await Promise.all([this.store.getJudges(), this.store.getAbsent(), this.store.listScores()])
    const present = judges.filter((j) => !absent.includes(j.id))
    return { judges, absent, present, scores: scores.filter((x) => !absent.includes(x.judgeId)) }
  }

  async login(pin: string) {
    // Too many wrong PINs anywhere pauses every login for a while. Tablets already logged
    // in are not affected, and guessing a 6-digit PIN becomes a matter of weeks, not hours.
    const now = this.now().getTime()
    const f = await this.store.getLoginFailures()
    const open = f && now - f.since < LOGIN_WINDOW_MS ? f : { since: now, count: 0 }
    if (open.count >= LOGIN_MAX_FAILURES) {
      const minutes = Math.ceil((open.since + LOGIN_WINDOW_MS - now) / 60000)
      throw new ApiError(429, 'too_many_tries', `Too many wrong PINs. Try again in ${minutes} min, or ask the operator.`)
    }
    try {
      return await this.checkPin(pin)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'bad_pin') await this.store.putLoginFailures({ since: open.since, count: open.count + 1 })
      throw e
    }
  }

  private async checkPin(pin: string) {
    if (!/^\d{4,8}$/.test(pin)) throw new ApiError(401, 'bad_pin', 'Wrong PIN')
    const exp = Math.floor(this.now().getTime() / 1000) + SESSION_DAYS * 86400
    const admin = await this.store.getAdminPinHash()
    if (admin && verifyPin(pin, admin)) {
      return { token: signToken({ role: 'admin', sub: 'admin', exp, key: pinKey(admin) }, this.secret), role: 'admin' as const }
    }
    for (const j of await this.store.getJudges()) {
      if (verifyPin(pin, j.pinHash)) {
        await this.store.touchPresence(j.id, this.now().toISOString())
        return {
          token: signToken({ role: 'judge', sub: j.id, exp, key: pinKey(j.pinHash) }, this.secret),
          role: 'judge' as const,
          judge: { id: j.id, group: j.group, name: j.name, title: j.title ?? '' },
        }
      }
    }
    throw new ApiError(401, 'bad_pin', 'Wrong PIN')
  }

  /** The session's PIN is still the current one; a rotated PIN logs that device out. */
  async checkSession(s: Session) {
    const stored = s.role === 'admin'
      ? await this.store.getAdminPinHash()
      : (await this.store.getJudges()).find((j) => j.id === s.sub)?.pinHash
    if (!stored || !s.key || pinKey(stored) !== s.key) throw new ApiError(401, 'unauthorized', 'Please log in again')
  }

  /**
   * The public stage screen (shown on the venue LED, no login): the running order and
   * the pitch timer only. No judges, scores or ties.
   */
  async stage() {
    const r = normalizeRunOrder(await this.store.getRunOrder())
    return {
      runOrder: { order: r.order, current: r.current, startedAt: r.startedAt, pausedAt: r.pausedAt, pausedMs: r.pausedMs, reached: r.reached },
      serverTime: this.now().toISOString(),
    }
  }

  /**
   * Everything a screen needs in one call. Judges get their own sheets, the running
   * order, and any tie in the category they own (averages only, not other judges'
   * sheets); the admin gets everything.
   */
  async state(s: Session) {
    const [{ judges, absent, present, scores }, closedGroups, runOrder, picks] = await Promise.all([
      this.panel(),
      this.store.getClosedGroups(),
      this.store.getRunOrder(),
      this.store.getTieBreaks(),
    ])
    const pub = ({ id, group, name, title }: JudgeAccount) => ({ id, group, name, title: title ?? '' })
    const publicJudges = judges.map(pub)
    const ties = categoryTies(scores, present.length, picks)
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
        absent: absent.includes(s.sub),
        // An absent judge's own sheets stay on their tablet; they just stop counting.
        scores: (await this.store.listScores()).filter((x) => x.judgeId === s.sub),
        ties: ties.filter((t) => categoryOf(t.category).group === me?.group),
      }
    }
    // Screens count and average over `judges`, so they list the panel only; absent judges
    // come separately so the operator can bring them back.
    return {
      ...common,
      judges: present.map(pub),
      absentJudges: judges.filter((j) => absent.includes(j.id)).map(pub),
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
    if ((await this.store.getAbsent()).includes(judge.id)) {
      throw new ApiError(423, 'absent', 'You are marked absent, so your scores do not count. Ask the operator.')
    }
    if ((await this.store.getClosedGroups()).includes(categoryOf(team.category).group)) {
      throw new ApiError(423, 'group_closed', 'This category is closed. Ask the operator to change a score.')
    }
    const prev = await this.store.getScore(judge.id, teamId)
    if (prev && input.version <= prev.version) {
      throw new ApiError(409, 'stale', 'A newer version is already saved', prev)
    }
    // A submitted sheet is final until the judges' deliberation opens.
    if (prev?.status === 'submitted' && !normalizeRunOrder(await this.store.getRunOrder()).deliberation) {
      throw new ApiError(423, 'submitted', 'Submitted. Scores can be changed during the judges\' deliberation.', prev)
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
    const [{ present, scores }, picks] = await Promise.all([this.panel(), this.store.getTieBreaks()])
    const sheets = submittedSheets(scores)
    const submitted = [...sheets.values()].reduce((a, x) => a + x.length, 0)
    if (submitted < TEAMS.length * present.length) throw new ApiError(409, 'not_all_in', 'Every judge must submit every team before the result is locked')
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
    if ((await this.store.getAbsent()).includes(judgeId)) throw new ApiError(409, 'absent', 'This judge is marked absent. Bring them back first.')
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

  /**
   * Mark a judge absent (did not come, or left mid-event) or bring them back. Their sheets
   * stay stored but leave the averages, the lock check and the ties until they are back.
   * Refused once the result is locked, and at least two judges stay on the panel.
   */
  async setJudgeAbsent(s: Session, judgeId: string, absent: boolean) {
    requireAdmin(s)
    await this.requireUnlocked()
    const [judges, current] = await Promise.all([this.store.getJudges(), this.store.getAbsent()])
    if (!judges.some((j) => j.id === judgeId)) throw new ApiError(404, 'not_found', 'Unknown judge')
    if (absent && !current.includes(judgeId) && judges.length - current.length <= 2) {
      throw new ApiError(409, 'panel_too_small', 'At least two judges must stay on the panel')
    }
    await this.store.setAbsent(judgeId, absent)
    await this.audit(absent ? 'judge_absent' : 'judge_back', { judgeId })
    return { absent: await this.store.getAbsent() }
  }

  async putDeliberation(s: Session, d: Deliberation) {
    requireAdmin(s)
    const prev = await this.store.getDeliberation()
    if (prev?.lockedAt) throw new ApiError(423, 'locked', 'The result is locked')
    const prevLog = prev?.log.length ?? 0
    if (!Array.isArray(d?.order) || !Array.isArray(d?.log)) throw new ApiError(400, 'bad_deliberation', 'Invalid deliberation')
    if (d.log.length < prevLog) throw new ApiError(409, 'stale', 'Deliberation changed on another device', prev)
    if (d.log.slice(prevLog).some((c) => typeof c?.reason !== 'string' || !c.reason.trim())) throw new ApiError(400, 'reason_required', 'A reason is required to change the order')
    if (d.lockedAt) await this.requireLockable(d)
    if (d.order.length > 0) {
      const [{ scores }, picks] = await Promise.all([this.panel(), this.store.getTieBreaks()])
      const sheets = submittedSheets(scores)
      const proposed = proposeRanks(CATEGORIES.map((c) => rankCategory(c.id, TEAMS, sheets, picks[c.id]?.teamId)))
      if (!keepsScoreOrder(proposed, d.order)) throw new ApiError(409, 'not_tied', 'Only winners with exactly the same average can change places')
    }
    await this.store.putDeliberation(d)
    for (const change of d.log.slice(prevLog)) await this.audit('reorder_rank', { ...change })
    if (d.lockedAt) await this.audit('lock_result', { order: d.order })
    return d
  }

  /**
   * The operator sets the running order, the team on stage, the pitch timer and whether
   * the judges' deliberation is open. `timer: 'start'` stamps the server time, so every
   * tablet counts from the same moment; 'pause' and 'resume' hold it between the deck
   * and the video. Teams only move inside their category, and the show never goes back
   * to a category it has left.
   */
  async putRunOrder(s: Session, body: { order?: string[]; current?: string | null; timer?: 'start' | 'reset' | 'pause' | 'resume'; deliberation?: boolean }) {
    requireAdmin(s)
    const prev = normalizeRunOrder(await this.store.getRunOrder())
    const order = body.order === undefined ? prev.order : normalizeRunOrder({ order: body.order }).order
    if (!sameCategoryLayout(order, prev.order)) throw new ApiError(400, 'bad_order', 'Teams can only move inside their own category')
    const current = body.current === undefined ? prev.current : body.current
    if (current && current !== prev.current && !canPutOnStage({ ...prev, order }, current)) {
      throw new ApiError(409, 'no_going_back', 'That category has already presented; the show cannot go back to it')
    }
    const next: RunOrder = normalizeRunOrder({ ...prev, order, current, deliberation: body.deliberation ?? prev.deliberation })
    const now = this.now()
    if (next.current !== prev.current) Object.assign(next, { startedAt: null, pausedAt: null, pausedMs: 0 })
    if (body.timer === 'start' && next.current) Object.assign(next, { startedAt: now.toISOString(), pausedAt: null, pausedMs: 0 })
    if (body.timer === 'reset') Object.assign(next, { startedAt: null, pausedAt: null, pausedMs: 0 })
    if (body.timer === 'pause' && next.startedAt && !next.pausedAt) next.pausedAt = now.toISOString()
    if (body.timer === 'resume' && next.pausedAt) {
      next.pausedMs = (next.pausedMs ?? 0) + Math.max(0, now.getTime() - Date.parse(next.pausedAt))
      next.pausedAt = null
    }
    await this.store.putRunOrder(next)
    if (next.order.join() !== prev.order.join()) await this.audit('set_order', { order: next.order })
    if (next.current !== prev.current) await this.audit('now_presenting', { teamId: next.current })
    if (next.startedAt && next.startedAt !== prev.startedAt) await this.audit('start_timer', { teamId: next.current })
    if (next.deliberation !== prev.deliberation) await this.audit(next.deliberation ? 'open_deliberation' : 'close_deliberation', {})
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
    const { present, scores } = await this.panel()
    const tie = categoryTies(scores, present.length, {}).find((t) => t.category === category)
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
    const deliberation = await this.store.getDeliberation()
    // A locked result is the Grand Final's outcome: wiping it takes a deliberate, different phrase.
    const phrase = deliberation?.lockedAt ? RESET_LOCKED : 'RESET'
    if (confirm !== phrase) throw new ApiError(400, 'confirm_required', `Type ${phrase} to confirm`)
    const [scores, judges, absent, closedGroups, runOrder, tieBreaks, audit, oldEpoch] = await Promise.all([
      this.store.listScores(), this.store.getJudges(), this.store.getAbsent(), this.store.getClosedGroups(),
      this.store.getRunOrder(), this.store.getTieBreaks(), this.store.listAudit(), this.store.getEpoch(),
    ])
    const counts = { scores: scores.length }
    const epoch = this.now().toISOString()
    // Keep everything that is about to be deleted, so a mistaken reset can be undone by hand.
    const snapshot: Record<string, unknown> = {
      archivedAt: epoch, epoch: oldEpoch, judges: judges.map(({ id, group, name, title }) => ({ id, group, name, title })),
      absent, closedGroups, runOrder: runOrder ?? null, tieBreaks, deliberation: deliberation ?? null, scores, audit,
    }
    // One DynamoDB item holds at most 400 KB; drop the oldest change-log entries if needed.
    while (JSON.stringify(snapshot).length > ARCHIVE_LIMIT && (snapshot.audit as unknown[]).length > 0) {
      snapshot.audit = (snapshot.audit as unknown[]).slice(Math.ceil((snapshot.audit as unknown[]).length / 4))
    }
    await this.store.archive(epoch, snapshot)
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
  if (typeof input?.sheet !== 'object' || input.sheet === null || Array.isArray(input.sheet)) throw new ApiError(400, 'bad_score', 'Invalid score sheet')
  const keys = Object.keys(input.sheet)
  const ok =
    keys.every((k) => (CRITERIA as readonly string[]).includes(k)) &&
    Object.values(input.sheet).every((v) => v === 1 || v === 2 || v === 3 || v === 4) &&
    typeof input.note === 'string' &&
    input.note.length <= 200 &&
    (input.status === 'draft' || input.status === 'submitted') &&
    Number.isInteger(input.version) &&
    // Tablets count taps from 1; a huge version would lock the judge out of their own sheet.
    input.version >= 0 && input.version <= MAX_VERSION
  if (!ok) throw new ApiError(400, 'bad_score', 'Invalid score sheet')
  if (input.status === 'submitted' && !isComplete(input.sheet)) {
    throw new ApiError(400, 'incomplete', `All ${CRITERIA.length} criteria are needed to submit`)
  }
}
