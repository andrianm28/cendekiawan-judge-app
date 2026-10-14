import { useCallback, useEffect, useMemo, useState } from 'react'
import { EMPTY_DELIBERATION } from '../domain/deliberation'
import { DEFAULT_RUN_ORDER, moveInOrder, stepCurrent } from '../domain/runOrder'
import { averagedFinal, finalScore, isComplete, type PartialSheet, type ScoreSheet } from '../domain/scoring'
import { CATEGORIES, categoryOf, TEAMS, type Team } from '../domain/teams'
import type { TieSummary } from '../domain/ties'
import type { Judge } from '../judges'
import type { ScoreRecord } from '../storage/scoreStore'
import type { Api, AuditEntry, ServerState } from '../sync/api'
import { Header } from './Header'
import { JudgeAvatar, JudgeBadge } from './JudgeBadge'
import { Leaderboard } from './Leaderboard'
import { PrintSheets } from './PrintSheets'
import { Results, type DeliberationIO } from './Results'
import { ScoreForm } from './ScoreForm'
import { TiePick } from './TiePick'
import { Timer } from './Timer'

const EVERY_MS = 3000
const LIVE_MS = 30_000

type View = { kind: 'board' } | { kind: 'correct'; judge: Judge; team: Team } | { kind: 'results' } | { kind: 'print' } | { kind: 'leaderboard' } | { kind: 'tie'; tie: TieSummary } | { kind: 'judge'; judge: Judge }

/**
 * The operator's laptop: runs the stage (team on stage, running order, pitch timer),
 * tracks every judge's sheets, closes categories, corrects scores with a reason.
 */
export function OperatorBoard({ api, onLogout }: { api: Api; onLogout: () => void }) {
  const [state, setState] = useState<ServerState | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [error, setError] = useState('')
  const [view, setView] = useState<View>({ kind: 'board' })
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api.state(), api.audit()])
      setState(s)
      setAudit(a)
      setNow(Date.now())
      setError('')
    } catch (e) {
      if ((e as { status?: number }).status === 401) return onLogout()
      setError('Cannot reach the server. Showing the last known state.')
    }
  }, [api, onLogout])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), EVERY_MS)
    return () => clearInterval(t)
  }, [refresh])

  const records: ScoreRecord[] = useMemo(() => (state?.scores ?? []).map((s) => ({ ...s, synced: true })), [state])
  const io: DeliberationIO = useMemo(() => ({
    load: async () => (await api.state()).deliberation ?? EMPTY_DELIBERATION,
    save: async (d) => void (await api.putDeliberation(d)),
    loadTies: async () => (await api.state()).tieBreaks ?? {},
    pickTie: async (category, teamId) => void (await api.pickTieWinner(category, teamId)),
  }), [api])

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
    await refresh()
  }

  if (view.kind === 'results') {
    return <Results records={records} judges={state?.judges} io={io} onBack={() => setView({ kind: 'board' })} />
  }
  if (view.kind === 'judge') {
    return (
      <JudgeEditor
        judge={view.judge}
        judges={state?.judges ?? []}
        onSave={async (change) => {
          await api.updateJudge(view.judge.id, change)
          await refresh()
          setView({ kind: 'board' })
        }}
        onBack={() => setView({ kind: 'board' })}
      />
    )
  }
  if (view.kind === 'tie') {
    return (
      <TiePick
        tie={view.tie}
        onPick={async (teamId) => {
          await api.pickTieWinner(view.tie.category, teamId)
          await refresh()
        }}
        onBack={() => setView({ kind: 'board' })}
      />
    )
  }
  if (view.kind === 'leaderboard') {
    return <Leaderboard records={records} judges={state?.judges.length} tieBreaks={state?.tieBreaks} updatedAt={state ? now : null} error={error} onBack={() => setView({ kind: 'board' })} />
  }
  if (view.kind === 'print') return <PrintSheets judges={state?.judges ?? []} order={state?.runOrder.order} onBack={() => setView({ kind: 'board' })} />
  if (view.kind === 'correct') {
    return (
      <Correction
        judge={view.judge}
        team={view.team}
        record={records.find((r) => r.judgeId === view.judge.id && r.teamId === view.team.id)}
        onSave={(r, reason) => act(() => api.correctScore(view.judge.id, view.team.id, r, reason)).then(() => setView({ kind: 'board' }))}
        onBack={() => setView({ kind: 'board' })}
      />
    )
  }

  const judges = state?.judges ?? []
  const submitted = records.filter((r) => r.status === 'submitted' && isComplete(r.sheet)).length
  const expected = TEAMS.length * Math.max(judges.length, 1)
  const run = state?.runOrder ?? DEFAULT_RUN_ORDER
  const offset = state ? Date.parse(state.serverTime) - now : 0
  const onStage = TEAMS.find((t) => t.id === run.current)
  const setRun = (body: Parameters<Api['putRunOrder']>[0]) => act(() => api.putRunOrder(body))
  const sheetOf = (judgeId: string, teamId: string) => records.find((x) => x.judgeId === judgeId && x.teamId === teamId)

  return (
    <div className="screen wide">
      <Header>
        <div className="bar-title"><strong>Operator</strong><span className="sub">{submitted} of {expected} score sheets submitted</span></div>
        <button className="link" onClick={() => setView({ kind: 'leaderboard' })}>Leaderboard</button>
        <button className="link" onClick={() => setView({ kind: 'results' })}>Deliberation ›</button>
        <button className="link" onClick={() => setView({ kind: 'print' })}>Print sheets</button>
        <button className="link" onClick={onLogout}>Log out</button>
      </Header>
      {error && <p className="banner">{error}</p>}
      {!state ? <p className="muted">Loading…</p> : (
        <>
          <section className="card stage">
            <div className="stage-now">
              <span className="eyebrow">On stage</span>
              <strong className="stage-team">{onStage ? `${onStage.order}. ${onStage.appName}` : 'Nobody yet'}</strong>
              {onStage && <span className="muted small">{onStage.teamName} · {onStage.university} · {categoryOf(onStage.category).name}</span>}
            </div>
            <div className="stage-controls">
              <button className="secondary" onClick={() => void setRun(stepCurrent(run, -1))} disabled={!run.current}>‹ Previous</button>
              {onStage && (
                <span className="stage-timer">
                  <Timer startedAt={run.startedAt ? Date.parse(run.startedAt) - offset : null} />
                  <button className="secondary" onClick={() => void setRun({ timer: run.startedAt ? 'reset' : 'start' })}>
                    {run.startedAt ? 'Reset timer' : 'Start timer'}
                  </button>
                </span>
              )}
              <button className="primary compact" onClick={() => void setRun(stepCurrent(run, 1))}>
                {!run.current ? 'Start with first team ›' : run.order.indexOf(run.current) === run.order.length - 1 ? 'Finish ›' : 'Next team ›'}
              </button>
            </div>
            <p className="muted small">Judges' tablets open the team on stage and show this timer. Judges only score.</p>
            <details className="run-order">
              <summary>Running order</summary>
              <ol>
                {run.order.map((id, i) => {
                  const t = TEAMS.find((x) => x.id === id)!
                  const done = judges.filter((j) => sheetOf(j.id, id)?.status === 'submitted').length
                  return (
                    <li key={id} className={id === run.current ? 'live' : undefined}>
                      <span className="run-name"><strong>{t.appName}</strong> <span className="muted small">{categoryOf(t.category).name} · {done}/{judges.length} scored</span></span>
                      <span className="moves">
                        <button className="small-btn" aria-label="Move up" disabled={i === 0} onClick={() => void setRun({ order: moveInOrder(run, id, -1).order })}>▲</button>
                        <button className="small-btn" aria-label="Move down" disabled={i === run.order.length - 1} onClick={() => void setRun({ order: moveInOrder(run, id, 1).order })}>▼</button>
                        <button className="secondary" disabled={id === run.current} onClick={() => void setRun({ current: id })}>On stage</button>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </details>
          </section>

          <section className="card">
            <h2>Judges</h2>
            <ul className="board-judges">
              {judges.map((judge) => {
                const seen = state.presence?.[judge.id]
                const ago = seen ? now - Date.parse(seen) : Infinity
                const done = records.filter((r) => r.judgeId === judge.id && r.status === 'submitted').length
                const owns = CATEGORIES.find((c) => c.group === judge.group)
                return (
                  <li key={judge.id}>
                    <JudgeAvatar judge={judge} />
                    <span className="team-name">
                      <strong>Judge {judge.group} · {judge.name}</strong>
                      {judge.title && <span className="small">{judge.title}</span>}
                      <span className="muted small">Owns {owns?.name ?? `Group ${judge.group}`} (tie-breaks) · {done}/{TEAMS.length} submitted</span>
                    </span>
                    <span className={ago < LIVE_MS ? 'seen live' : 'seen muted'}>
                      {ago < LIVE_MS ? '● online' : seen ? `seen ${Math.round(ago / 60000)} min ago` : 'not logged in'}
                    </span>
                    <button className="secondary" onClick={() => setView({ kind: 'judge', judge })}>Edit judge</button>
                  </li>
                )
              })}
            </ul>
          </section>

          {CATEGORIES.map((c) => {
            const closed = state.closedGroups.includes(c.group)
            const tie = state.ties.find((t) => t.category === c.id)
            const owner = judges.find((j) => j.group === c.group)
            const teams = run.order.map((id) => TEAMS.find((t) => t.id === id)!).filter((t) => t.category === c.id)
            return (
              <section className="card board-group" key={c.id}>
                <div className="row">
                  <h2>{c.name} {closed && <span className="pill submitted">Closed</span>}</h2>
                  <button className={closed ? 'secondary' : 'secondary danger'} onClick={() => {
                    if (closed || window.confirm(`Close ${c.name}? Judges can no longer change these 4 teams' scores.`)) {
                      void act(() => api.setGroupClosed(c.group, !closed))
                    }
                  }}>{closed ? 'Reopen' : 'Close category'}</button>
                </div>
                {tie && (
                  <p className="banner">
                    Tie at the top{tie.pick ? `: ${owner?.name ?? 'the judge'} chose ${TEAMS.find((t) => t.id === tie.pick)?.appName}.` : `. Waiting for ${owner?.name ?? 'the category judge'} to choose the winner.`}{' '}
                    <button className="link" onClick={() => setView({ kind: 'tie', tie })}>Record the pick for them</button>
                  </p>
                )}
                <div className="table-scroll">
                  <table className="matrix">
                    <thead>
                      <tr>
                        <th>Team</th>
                        {judges.map((j) => <th key={j.id} className="num" title={j.name}>{initials(j.name)}</th>)}
                        <th className="num">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((t) => {
                        const sheets = judges.map((j) => sheetOf(j.id, t.id)).filter((r) => r?.status === 'submitted' && isComplete(r.sheet)).map((r) => r!.sheet as ScoreSheet)
                        return (
                          <tr key={t.id} className={t.id === run.current ? 'live' : undefined}>
                            <td><strong>{t.appName}</strong> <span className="muted small">{t.university}</span></td>
                            {judges.map((j) => {
                              const r = sheetOf(j.id, t.id)
                              const label = !r ? '–' : r.status === 'submitted' && isComplete(r.sheet) ? String(finalScore(r.sheet)) : 'draft'
                              return (
                                <td key={j.id} className="num">
                                  <button className={`cell ${!r ? 'empty' : r.status}`} disabled={!r} title={r ? `Correct ${j.name}'s score` : 'Not scored yet'}
                                    onClick={() => setView({ kind: 'correct', judge: j, team: t })}>{label}</button>
                                </td>
                              )
                            })}
                            <td className="num">{sheets.length ? averagedFinal(sheets) : ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </>
      )}
      <ResetCard scores={records.length} onReset={() => act(async () => {
        const r = await api.resetEventData()
        window.alert(`Reset done: ${r.scores} score sheets removed. Tablets clear their copies on their next sync.`)
      })} />
      <section className="card">
        <h2>Change log</h2>
        {audit.length === 0 ? <p className="muted small">No changes yet.</p> : (
          <ul className="audit">
            {[...audit].reverse().map((a, i) => (
              <li key={i}><time>{new Date(a.at).toLocaleTimeString()}</time>{describe(a, judges)}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Wipe the rehearsal (UAT) data. Typing RESET is the guard against a mis-tap on the day. */
function ResetCard({ scores, onReset }: { scores: number; onReset: () => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <section className="card danger-zone">
      <h2>Reset event data</h2>
      <p className="small">
        After a rehearsal: deletes all {scores} score sheets, tie picks, closed categories, the running order, the
        deliberation and the change log, on the server and on every tablet. Judges, their names and all PINs stay.
        Never use this during the Grand Final.
      </p>
      <div className="row reset-row">
        <input type="text" placeholder="Type RESET" value={text} onChange={(e) => setText(e.target.value)} aria-label="Type RESET to confirm" />
        <button className="secondary danger" disabled={text !== 'RESET' || busy} onClick={() => {
          if (!window.confirm('Delete all event data now? This cannot be undone.')) return
          setBusy(true)
          void onReset().finally(() => {
            setBusy(false)
            setText('')
          })
        }}>Reset all data</button>
      </div>
    </section>
  )
}

const initials = (name: string) => name.replace(/^(Mba|Pak|Bu|Dr\.?|Prof\.?)\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || name

function describe(a: AuditEntry, judges: Judge[]): string {
  const d = a.detail as Record<string, string | number>
  const team = TEAMS.find((t) => t.id === d.teamId)?.appName ?? d.teamId
  const judge = judges.find((j) => j.id === d.judgeId)?.name ?? d.judgeId
  switch (a.action) {
    case 'close_group': return `Closed ${CATEGORIES.find((c) => c.group === d.group)?.name ?? `Group ${d.group}`}`
    case 'open_group': return `Reopened ${CATEGORIES.find((c) => c.group === d.group)?.name ?? `Group ${d.group}`}`
    case 'correct_score': return `Corrected ${judge}'s score for ${team}: ${d.reason}`
    case 'rename_judge': {
      const parts = [d.before === d.after ? `Updated ${d.after}'s profile` : `Renamed ${d.before} to ${d.after}`]
      if (d.toGroup) parts.push(`now owns ${CATEGORIES.find((c) => c.group === d.toGroup)?.name}${d.swappedWith ? ` (swapped with ${judges.find((j) => j.id === d.swappedWith)?.name ?? d.swappedWith})` : ''}`)
      if (d.pinChanged) parts.push('PIN changed')
      return parts.join(', ')
    }
    case 'reorder_rank': return `${team}: Rank ${d.from} → ${d.to}. ${d.reason}`
    case 'lock_result': return 'Locked the result'
    case 'set_order': return 'Changed the running order'
    case 'now_presenting': return d.teamId ? `On stage: ${team}` : 'Stage cleared'
    case 'start_timer': return `Timer started for ${team}`
    case 'reset': return `Event data reset (${d.scores} score sheets removed)`
    case 'tie_pick': return `Tie in ${CATEGORIES.find((c) => c.id === d.category)?.name ?? d.category}: ${a.actor === 'admin' ? 'operator recorded' : `${judges.find((j) => j.id === a.actor)?.name ?? a.actor} chose`} ${team}`
    default: return a.action
  }
}

/**
 * Operator sets up one judge: name, role, the category they own for tie-breaks and,
 * optionally, a new PIN. Picking a category another judge owns swaps the two.
 */
function JudgeEditor({ judge, judges, onSave, onBack }: {
  judge: Judge
  judges: Judge[]
  onSave: (change: { name: string; title: string; group: number; pin?: string }) => Promise<void>
  onBack: () => void
}) {
  const [name, setName] = useState(judge.name)
  const [title, setTitle] = useState(judge.title ?? '')
  const [group, setGroup] = useState(judge.group)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const holder = judges.find((j) => j.id !== judge.id && j.group === group)
  const pinBad = pin !== '' && !/^\d{6,8}$/.test(pin)
  const pinMismatch = pin !== '' && pin !== pin2
  const canSave = name.trim() !== '' && !pinBad && !pinMismatch && !busy
  const preview: Judge = { ...judge, name: name.trim() || judge.name, title: title.trim(), group }

  return (
    <div className="screen judge-editor">
      <Header>
        <button className="link" onClick={onBack}>‹ Board</button>
        <div className="bar-title"><strong>Edit Judge {judge.group}</strong><span className="sub">Name, role, category and PIN</span></div>
      </Header>
      <section className="card">
        <p className="muted small">This is what the judge sees at the top of their tablet:</p>
        <JudgeBadge judge={preview} />
      </section>
      <form className="card form-grid" onSubmit={(e) => {
        e.preventDefault()
        if (!canSave) return
        setBusy(true)
        setError('')
        onSave({ name: name.trim(), title: title.trim(), group, ...(pin ? { pin } : {}) })
          .catch((err) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false))
      }}>
        <label>
          <span>Name</span>
          <input type="text" value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>Role and organisation</span>
          <input type="text" value={title} maxLength={80} placeholder="e.g. President Director, Elitery" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>Category they own (decides a tie in that category)</span>
          <select value={group} onChange={(e) => setGroup(Number(e.target.value))}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.group}>{c.name}</option>)}
          </select>
          {group !== judge.group && holder && (
            <span className="small warn">{holder.name} owns this now and will take {CATEGORIES.find((c) => c.group === judge.group)?.name} instead.</span>
          )}
        </label>
        <label>
          <span>New PIN (6–8 digits, leave empty to keep the current PIN)</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          {pinBad && <span className="small warn">The PIN must be 6 to 8 digits.</span>}
        </label>
        {pin !== '' && (
          <label>
            <span>Repeat the new PIN</span>
            <input type="password" inputMode="numeric" autoComplete="new-password" value={pin2} maxLength={8} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
            {pin2 !== '' && pinMismatch && <span className="small warn">The two PINs do not match.</span>}
          </label>
        )}
        {pin !== '' && <p className="small muted">The judge keeps using their tablet until they log out; the new PIN is needed the next time they log in. Give it to them in person.</p>}
        {error && <p className="banner">{error}</p>}
        <div className="editor-actions">
          <button type="button" className="secondary" onClick={onBack}>Cancel</button>
          <button type="submit" className="primary" disabled={!canSave}>Save judge</button>
        </div>
      </form>
    </div>
  )
}

/** Operator edits a judge's sheet; nothing is sent until a reason is given. */
function Correction({ judge, team, record, onSave, onBack }: {
  judge: Judge
  team: Team
  record: ScoreRecord | undefined
  onSave: (r: { sheet: PartialSheet; note: string; status: ScoreRecord['status'] }, reason: string) => Promise<void>
  onBack: () => void
}) {
  const [draft, setDraft] = useState<ScoreRecord>(record ?? {
    judgeId: judge.id, teamId: team.id, sheet: {}, note: '', status: 'draft', version: 0, updatedAt: '', synced: true,
  })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const complete = isComplete(draft.sheet)
  return (
    <ScoreForm
      team={team}
      record={draft}
      locked={false}
      onChange={(c) => setDraft((d) => ({ ...d, ...c, sheet: { ...d.sheet, ...c.sheet } }))}
      onBack={onBack}
      footer={
        <>
          <label className="reason">
            <span>Correcting {judge.name}'s score. Reason (required):</span>
            <input type="text" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button className="primary" disabled={!reason.trim() || busy} onClick={() => {
            setBusy(true)
            void onSave({ sheet: draft.sheet, note: draft.note, status: complete ? 'submitted' : draft.status }, reason.trim())
              .finally(() => setBusy(false))
          }}>Save correction</button>
        </>
      }
    />
  )
}
