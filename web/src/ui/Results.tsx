import { useEffect, useState } from 'react'
import { applyOrder, EMPTY_DELIBERATION, lock, moveRank, type Deliberation, type FinalRank } from '../domain/deliberation'
import { resultsCsv, scoresCsv } from '../domain/exportCsv'
import { announcementOrder, exactFinal, proposeRanks, rankCategory } from '../domain/ranking'
import { c1, c2, isComplete, type ScoreSheet } from '../domain/scoring'
import { CATEGORIES, categoryOf, TEAMS, type CategoryId } from '../domain/teams'
import { categoryTies, type TieBreaks } from '../domain/ties'
import { JUDGES, type Judge } from '../judges'
import type { ScoreRecord } from '../storage/scoreStore'
import { download } from './download'
import { Header } from './Header'
import { getStore } from './useScores'

/** Deliberation view: category standings, Rank 1–5 the judges can reorder and lock, and the MC sheet. */
export interface DeliberationIO {
  load: () => Promise<Deliberation>
  save: (d: Deliberation) => Promise<void>
  /** Winners picked by each category's judge when its top finals are equal. */
  loadTies: () => Promise<TieBreaks>
  pickTie: (category: CategoryId, teamId: string) => Promise<void>
}

const localDeliberation: DeliberationIO = {
  load: async () => (await getStore()).getDeliberation(),
  save: async (d) => (await getStore()).saveDeliberation(d),
  loadTies: async () => (await getStore()).getTieBreaks(),
  pickTie: async (category, teamId) => {
    const store = await getStore()
    await store.saveTieBreaks({ ...(await store.getTieBreaks()), [category]: { teamId, by: 'local', at: new Date().toISOString() } })
  },
}

export function Results({ records, onBack, io = localDeliberation, judges = JUDGES }: {
  records: ScoreRecord[]
  judges?: Judge[]
  onBack: () => void
  /** Where the order and lock are kept: this tablet by default, the server for the operator. */
  io?: DeliberationIO
}) {
  const [delib, setDelib] = useState<Deliberation>(EMPTY_DELIBERATION)
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null)
  const [reason, setReason] = useState('')
  const [ties, setTies] = useState<TieBreaks>({})

  useEffect(() => {
    void io.load().then(setDelib)
  }, [io])
  // A judge may pick a tie winner on their tablet while this screen is open.
  useEffect(() => {
    void io.loadTies().then(setTies)
  }, [io, records])
  const pickTie = async (category: CategoryId, teamId: string) => {
    try {
      await io.pickTie(category, teamId)
    } catch (e) {
      window.alert(`Not saved: ${e instanceof Error ? e.message : e}`)
    }
    setTies(await io.loadTies())
  }
  const persist = async (d: Deliberation) => {
    const before = delib
    setDelib(d)
    try {
      await io.save(d)
    } catch (e) {
      setDelib(before)
      window.alert(`Not saved: ${e instanceof Error ? e.message : e}`)
    }
  }

  const sheetsByTeam = new Map<string, ScoreSheet[]>()
  const notesByTeam = new Map<string, string[]>()
  for (const r of records) {
    if (r.status !== 'submitted' || !isComplete(r.sheet)) continue
    sheetsByTeam.set(r.teamId, [...(sheetsByTeam.get(r.teamId) ?? []), r.sheet])
    if (r.note.trim()) notesByTeam.set(r.teamId, [...(notesByTeam.get(r.teamId) ?? []), r.note.trim()])
  }
  const avg = (teamId: string, f: (s: ScoreSheet) => number) => {
    const sheets = sheetsByTeam.get(teamId) ?? []
    return Math.round((sheets.reduce((a, s) => a + f(s), 0) / sheets.length) * 10) / 10
  }
  const standings = CATEGORIES.map((c) => rankCategory(c.id, TEAMS, sheetsByTeam, ties[c.id]?.teamId))
  const { ranks, stale } = applyOrder(proposeRanks(standings), delib)
  const openTies = categoryTies(records, judges.length, ties)
  const allIn = [...sheetsByTeam.values()].reduce((a, x) => a + x.length, 0) >= TEAMS.length * judges.length
  const unresolved = standings.some((s) => s.tiedAtTop)
  const locked = delib.lockedAt !== null

  const confirmMove = () => {
    if (!pending) return
    void persist(moveRank(ranks, delib, pending.from, pending.to, reason))
    setPending(null)
    setReason('')
  }

  const exportScores = () =>
    download('cendekiawan-scores.csv', scoresCsv(records.map((r) => ({
      team: TEAMS.find((t) => t.id === r.teamId)!,
      judgeName: judges.find((j) => j.id === r.judgeId)?.name ?? r.judgeId,
      sheet: r.sheet, note: r.note, status: r.status, updatedAt: r.updatedAt,
    }))))

  return (
    <div className="screen wide">
      <Header>
        <button className="link" onClick={onBack}>‹ Back</button>
        <div className="bar-title"><strong>Deliberation</strong><span className="sub">Grand Final · 20 October 2026</span></div>
        <button className="link" onClick={exportScores}>Export scores</button>
        <button className="link" onClick={() => download('cendekiawan-results.csv', resultsCsv(ranks))}>Export results</button>
        <button className="link" onClick={() => window.print()}>Print / PDF</button>
      </Header>

      {!allIn && <p className="banner">Not all scores are in. Rankings below are provisional.</p>}
      {stale && <p className="banner">A late score changed a category winner, so the saved order was reset to the proposal.</p>}

      <section className="card">
        <h2>Rank 1–5 {locked && <span className="pill submitted">Locked</span>}</h2>
        <p className="muted small">
          Category winners ordered by final score (average of all judges). Confirm or reorder before locking.
        </p>
        <table>
          <thead><tr><th>Rank</th><th>Award</th><th>App</th><th>Category</th><th className="num">Final</th><th /></tr></thead>
          <tbody>
            {ranks.map((r) => (
              <tr key={r.winner.team.id}>
                <td>{r.rank}{r.proposedRank !== r.rank && <span className="muted small"> (was {r.proposedRank})</span>}</td>
                <td>{r.award}{r.tiedWithAbove && <span className="pill draft">tie</span>}</td>
                <td>{r.winner.team.appName} <span className="muted small">{r.winner.team.university}</span></td>
                <td>{categoryOf(r.winner.team.category).name}</td>
                <td className="num">{r.winner.final} <span className="muted small">({exactFinal(r.winner)})</span></td>
                <td className="moves">
                  {!locked && (
                    <>
                      <button className="small-btn" disabled={r.rank === 1} aria-label="Move up"
                        onClick={() => setPending({ from: r.rank, to: r.rank - 1 })}>▲</button>
                      <button className="small-btn" disabled={r.rank === ranks.length} aria-label="Move down"
                        onClick={() => setPending({ from: r.rank, to: r.rank + 1 })}>▼</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {pending && (
          <div className="reason">
            <label>
              <span>Why move {ranks[pending.from - 1].winner.team.appName} to Rank {pending.to}?</span>
              <input autoFocus type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="row">
              <button className="link" onClick={() => setPending(null)}>Cancel</button>
              <button className="primary compact" disabled={!reason.trim()} onClick={confirmMove}>Move</button>
            </div>
          </div>
        )}

        {delib.log.length > 0 && (
          <ul className="log muted small">
            {delib.log.map((c, i) => (
              <li key={i}>
                {TEAMS.find((t) => t.id === c.teamId)?.appName}: Rank {c.from} → {c.to}. {c.reason}
              </li>
            ))}
          </ul>
        )}

        {!locked && ranks.length === 5 && (
          <button
            className="primary"
            disabled={!allIn || unresolved}
            title={!allIn ? 'Every judge must submit every team first' : unresolved ? 'A category tie still needs its winner' : undefined}
            onClick={() => window.confirm('Lock the result? It cannot be changed afterwards.') && void persist(lock(ranks, delib))}
          >
            Lock result
          </button>
        )}
        {!locked && !allIn && <p className="muted small">Lock becomes available once every judge has submitted all {TEAMS.length} teams.</p>}
        {!locked && unresolved && <p className="muted small">A category has a tie at the top: its judge chooses the winner first.</p>}
      </section>

      <div className="grid">
        {standings.map((s) => (
          <section className="card" key={s.category}>
            <h2>Group {categoryOf(s.category).group}: {categoryOf(s.category).name}</h2>
            {(() => {
              const tie = openTies.find((t) => t.category === s.category)
              const owner = judges.find((j) => j.group === categoryOf(s.category).group)?.name ?? 'The category judge'
              if (!tie) return s.tiedAtTop ? <p className="banner">Equal at the top. {owner} chooses the winner once every judge has scored this category.</p> : null
              return (
                <div className="banner no-print">
                  {tie.pick ? `Tie: ${TEAMS.find((t) => t.id === tie.pick)?.appName} chosen as winner.` : `Tie: ${owner} chooses the winner.`}
                  {!locked && (
                    <div className="row tie-choices">
                      {tie.tied.map((t) => (
                        <button key={t.teamId} className="secondary" disabled={tie.pick === t.teamId}
                          onClick={() => window.confirm(`Record ${TEAMS.find((x) => x.id === t.teamId)?.appName} as the ${categoryOf(s.category).name} winner?`) && void pickTie(s.category, t.teamId)}>
                          {TEAMS.find((x) => x.id === t.teamId)?.appName} (Real problem {t.d1}, Usable in real life {t.d4})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
            <ol className="standing">
              {s.ranked.map((r) => (
                <li key={r.team.id}>
                  <div className="standing-row">
                    <span>{r.team.appName}</span>
                    <span className="num">{r.final} <span className="muted small">({exactFinal(r)})</span></span>
                  </div>
                  <div className="muted small">C1 {avg(r.team.id, c1)} · C2 {avg(r.team.id, c2)}</div>
                  {notesByTeam.get(r.team.id)?.map((n, i) => <div key={i} className="small judge-note">“{n}”</div>)}
                </li>
              ))}
              {s.missing.map((t) => (
                <li key={t.id} className="muted"><span>{t.appName}</span><span>no score</span></li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <McSheet ranks={ranks} locked={locked} />
    </div>
  )
}

function McSheet({ ranks, locked }: { ranks: FinalRank[]; locked: boolean }) {
  return (
    <section className="card mc-sheet">
      <h2>MC sheet (announcement order) {!locked && <span className="pill draft">not locked</span>}</h2>
      <ol className="mc">
        {announcementOrder(ranks).map((r) => (
          <li key={r.rank}>
            <strong>{r.award}</strong>: {r.winner.team.appName} by {r.winner.team.teamName},{' '}
            {r.winner.team.university} ({categoryOf(r.winner.team.category).name})
          </li>
        ))}
      </ol>
    </section>
  )
}
