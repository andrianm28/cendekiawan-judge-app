import { useEffect, useMemo, useRef, useState } from 'react'
import { buildLeaderboard, movements, type Leaderboard as Board, type LeaderRow } from '../domain/leaderboard'
import { categoryOf } from '../domain/teams'
import type { TieBreaks } from '../domain/ties'
import type { ScoreRecord } from '../storage/scoreStore'
import { Header } from './Header'
import { getStore } from './useScores'

const HIGHLIGHT_MS = 15_000

/**
 * Live leaderboard for the operator laptop or the projector in the judges' room:
 * all 20 teams overall, per category, and the proposed Rank 1–5, refreshed as scores arrive.
 */
export function Leaderboard({ records, judges = 5, tieBreaks, updatedAt, error, onBack }: {
  records: ScoreRecord[]
  /** Number of judges; each scores every team. */
  judges?: number
  tieBreaks?: TieBreaks
  /** When the records were last fetched; null in single-tablet mode, where they are always current. */
  updatedAt?: number | null
  error?: string
  onBack: () => void
}) {
  const [includeDrafts, setIncludeDrafts] = useState(true)
  const [projector, setProjector] = useState(false)
  const [localTies, setLocalTies] = useState<TieBreaks>({})
  useEffect(() => {
    if (tieBreaks === undefined) void getStore().then((s) => s.getTieBreaks()).then(setLocalTies)
  }, [tieBreaks, records])
  const picks = tieBreaks ?? localTies
  const board = useMemo(() => buildLeaderboard(records, { includeDrafts, picks, judges }), [records, includeDrafts, picks, judges])
  const { moved, fresh } = useChanges(board)

  const toggleProjector = () => {
    const next = !projector
    setProjector(next)
    if (next) void document.documentElement.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) void document.exitFullscreen()
  }
  useEffect(() => {
    const onExit = () => !document.fullscreenElement && setProjector(false)
    document.addEventListener('fullscreenchange', onExit)
    return () => document.removeEventListener('fullscreenchange', onExit)
  }, [])

  const pct = Math.round((board.submitted / board.total) * 100)
  return (
    <div className={`screen wide leaderboard${projector ? ' projector' : ''}`}>
      <Header>
        {!projector && <button className="link" onClick={onBack}>‹ Back</button>}
        <div className="bar-title">
          <strong>Live leaderboard</strong>
          <span className="sub">
            <span className="live-dot" /> {board.submitted} of {board.total} sheets submitted
            {board.drafts > 0 && ` · ${board.drafts} draft${board.drafts > 1 ? 's' : ''}`}
            {updatedAt && ` · updated ${new Date(updatedAt).toLocaleTimeString()}`}
          </span>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />
          Include drafts
        </label>
        <button className="link" onClick={toggleProjector}>{projector ? 'Exit projector' : 'Projector'}</button>
      </Header>

      {error && <p className="banner">{error}</p>}
      <div className="progress" aria-label={`${pct}% submitted`}><span style={{ width: `${pct}%` }} /></div>
      {board.submitted < board.total && (
        <p className="muted small">Live standings while judging is in progress: each final is the average of the judges who have scored that team so far. Final ranks are confirmed in Deliberation.</p>
      )}

      <section className="card">
        <h2>Rank 1–5 (proposed)</h2>
        {board.podium.length === 0 ? <p className="muted small">No category winner yet.</p> : (
          <ol className="podium">
            {board.podium.map((p) => {
              const row = board.rows.find((r) => r.result.team.id === p.winner.team.id)!
              const open = board.categories.find((c) => c.category === p.winner.team.category)?.tiedAtTop
              return (
                <li key={p.winner.team.id} className={`podium-${p.rank}`}>
                  <span className="podium-rank">{p.rank}</span>
                  <span className="podium-award">{p.award}{p.tiedWithAbove && <span className="pill draft">tie</span>}</span>
                  <strong className="podium-app">{p.winner.team.appName}</strong>
                  <span className="muted small">{p.winner.team.university} · {categoryOf(p.winner.team.category).name}</span>
                  {open && <span className="pill draft">category tie: judge decides</span>}
                  <span className="podium-score">{p.winner.final}{row.provisional && <span className="pill draft">draft</span>}</span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="card">
        <h2>Overall</h2>
        <div className="table-scroll">
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th><th /><th>App</th><th>Category</th>
                <th className="num">Judges</th><th className="num">C1</th><th className="num">C2</th><th className="num">Final</th><th />
              </tr>
            </thead>
            <tbody>
              {board.rows.map((r) => (
                <Row key={r.result.team.id} row={r} judges={board.judges} move={moved.get(r.result.team.id)} fresh={fresh.has(r.result.team.id)} />
              ))}
              {board.unscored.map((t) => (
                <tr key={t.id} className="muted">
                  <td>–</td><td /><td>{t.appName} <span className="small">{t.university}</span></td>
                  <td>{categoryOf(t.category).name}</td><td className="num light">0/{board.judges}</td><td colSpan={4} className="small">not scored yet</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid">
        {board.categories.map((c) => {
          const cat = categoryOf(c.category)
          return (
            <section className="card" key={c.category}>
              <h2>Group {cat.group}: {cat.name}</h2>
              <p className="muted small">{c.rows.length} of {c.rows.length + c.missing.length} scored</p>
              {c.tiedAtTop && <p className="banner">Equal at the top: the category's judge chooses the winner.</p>}
              {c.pick && <p className="muted small">Tie broken by the category's judge.</p>}
              <ol className="standing">
                {c.rows.map((r) => (
                  <li key={r.result.team.id} className={fresh.has(r.result.team.id) ? 'flash' : undefined}>
                    <div className="standing-row">
                      <span>{r.categoryRank === 1 && !c.tiedAtTop && '★ '}{r.result.team.appName}{r.provisional && <span className="pill draft">draft</span>}</span>
                      <span className="num">{r.result.final}</span>
                    </div>
                    <div className="muted small">{r.result.team.university} · {r.result.judges}/{board.judges} judges · C1 {r.c1} · C2 {r.c2} · overall #{r.overallRank}</div>
                  </li>
                ))}
                {c.missing.map((t) => (
                  <li key={t.id} className="muted"><span>{t.appName}</span><span>no score</span></li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Row({ row, judges, move, fresh }: { row: LeaderRow; judges: number; move?: number; fresh: boolean }) {
  const t = row.result.team
  return (
    <tr className={[row.categoryRank === 1 ? 'leader' : '', fresh ? 'flash' : ''].join(' ')}>
      <td className="rank">{row.tiedWithAbove ? '=' : ''}{row.overallRank}</td>
      <td className="move">
        {move !== undefined && <span className={move > 0 ? 'up' : 'down'}>{move > 0 ? `▲${move}` : `▼${-move}`}</span>}
      </td>
      <td>
        <strong>{t.appName}</strong> <span className="muted small">{t.university}</span>
        {row.award && <div className="small award">{row.award}</div>}
      </td>
      <td>{categoryOf(t.category).name}{row.categoryRank === 1 && <span className="pill submitted">1st</span>}</td>
      <td className="num light">{row.result.judges}/{judges}</td>
      <td className="num light">{row.c1}</td>
      <td className="num light">{row.c2}</td>
      <td className="num">{row.result.final}</td>
      <td>{row.provisional && <span className="pill draft">draft</span>}</td>
    </tr>
  )
}

/** Rank moves and new or changed scores since the previous refresh, shown for a short while. */
function useChanges(board: Board) {
  const prev = useRef<Board | null>(null)
  const [state, setState] = useState<{ moved: Map<string, number>; fresh: Set<string> }>({ moved: new Map(), fresh: new Set() })
  useEffect(() => {
    const before = prev.current
    prev.current = board
    if (!before) return
    const finals = new Map(before.rows.map((r) => [r.result.team.id, r.result.finalTimes8Sum * 1000 + r.result.judges]))
    const fresh = new Set(
      board.rows.filter((r) => finals.get(r.result.team.id) !== r.result.finalTimes8Sum * 1000 + r.result.judges).map((r) => r.result.team.id),
    )
    const moved = movements(before, board)
    if (fresh.size === 0 && moved.size === 0) return
    setState({ moved, fresh })
    const t = setTimeout(() => setState({ moved: new Map(), fresh: new Set() }), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [board])
  return state
}
