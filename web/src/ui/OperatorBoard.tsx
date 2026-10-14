import { useCallback, useEffect, useMemo, useState } from 'react'
import { EMPTY_DELIBERATION } from '../domain/deliberation'
import { finalScore, isComplete, type PartialSheet } from '../domain/scoring'
import { CATEGORIES, TEAMS, teamsIn, type Team } from '../domain/teams'
import type { Judge } from '../judges'
import type { ScoreRecord } from '../storage/scoreStore'
import type { Api, AuditEntry, ServerState } from '../sync/api'
import { Header } from './Header'
import { Results, type DeliberationIO } from './Results'
import { ScoreForm } from './ScoreForm'

const EVERY_MS = 5000
const LIVE_MS = 30_000

type View = { kind: 'board' } | { kind: 'correct'; judge: Judge; team: Team } | { kind: 'results' }

/** The operator's laptop: who is scoring, close groups, corrections with a reason, deliberation. */
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

  const submitted = records.filter((r) => r.status === 'submitted' && isComplete(r.sheet)).length
  return (
    <div className="screen wide">
      <Header>
        <div className="bar-title"><strong>Operator</strong><span className="sub">{submitted} of {TEAMS.length} scores submitted</span></div>
        <button className="link" onClick={() => setView({ kind: 'results' })}>Deliberation ›</button>
        <button className="link" onClick={onLogout}>Log out</button>
      </Header>
      {error && <p className="banner">{error}</p>}
      {!state ? <p className="muted">Loading…</p> : (
        <div className="grid">
          {CATEGORIES.map((c) => {
            const judge = state.judges.find((j) => j.group === c.group)
            const closed = state.closedGroups.includes(c.group)
            const seen = judge && state.presence?.[judge.id]
            const ago = seen ? now - Date.parse(seen) : Infinity
            return (
              <section className="card board-group" key={c.id}>
                <h2>Group {c.group}: {c.name} {closed && <span className="pill submitted">Closed</span>}</h2>
                <div className="row">
                  <span>
                    <strong>{judge?.name ?? '—'}</strong>{' '}
                    <span className={ago < LIVE_MS ? 'seen live' : 'seen muted'}>
                      {ago < LIVE_MS ? '● online' : seen ? `seen ${Math.round(ago / 60000)} min ago` : 'not logged in'}
                    </span>
                  </span>
                  <span className="row">
                    {judge && (
                      <button className="secondary" onClick={() => {
                        const name = window.prompt(`Judge name for Group ${c.group}`, judge.name)
                        if (name && name.trim() !== judge.name) void act(() => api.renameJudge(judge.id, name.trim()))
                      }}>Rename</button>
                    )}
                    <button className={closed ? 'secondary' : 'secondary danger'} onClick={() => {
                      if (closed || window.confirm(`Close Group ${c.group}? The judge can no longer change scores.`)) {
                        void act(() => api.setGroupClosed(c.group, !closed))
                      }
                    }}>{closed ? 'Reopen' : 'Close group'}</button>
                  </span>
                </div>
                <ul className="board-teams">
                  {teamsIn(c.id).map((t) => {
                    const r = judge && records.find((x) => x.judgeId === judge.id && x.teamId === t.id)
                    const status = !r ? 'Not started' : r.status === 'submitted' ? 'Submitted' : 'Draft'
                    return (
                      <li key={t.id}>
                        <button className="board-team" disabled={!judge} onClick={() => judge && setView({ kind: 'correct', judge, team: t })}>
                          <span className="order">{t.order}</span>
                          <span className="team-name"><strong>{t.appName}</strong><span className="muted small">{t.university}</span></span>
                          <span className={`pill ${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
                          <span className="score">{r && isComplete(r.sheet) ? finalScore(r.sheet) : ''}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      <section className="card">
        <h2>Change log</h2>
        {audit.length === 0 ? <p className="muted small">No operator changes yet.</p> : (
          <ul className="audit">
            {[...audit].reverse().map((a, i) => (
              <li key={i}><time>{new Date(a.at).toLocaleTimeString()}</time>{describe(a, state?.judges ?? [])}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function describe(a: AuditEntry, judges: Judge[]): string {
  const d = a.detail as Record<string, string | number>
  const team = TEAMS.find((t) => t.id === d.teamId)?.appName ?? d.teamId
  const judge = judges.find((j) => j.id === d.judgeId)?.name ?? d.judgeId
  switch (a.action) {
    case 'close_group': return `Closed Group ${d.group}`
    case 'open_group': return `Reopened Group ${d.group}`
    case 'correct_score': return `Corrected ${judge}'s score for ${team}: ${d.reason}`
    case 'rename_judge': return `Renamed ${d.before} to ${d.after}`
    case 'reorder_rank': return `${team}: Rank ${d.from} → ${d.to}. ${d.reason}`
    case 'lock_result': return 'Locked the result'
    default: return a.action
  }
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
