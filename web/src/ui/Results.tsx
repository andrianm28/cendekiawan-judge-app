import { announcementOrder, proposeRanks, rankCategory } from '../domain/ranking'
import { isComplete, type ScoreSheet } from '../domain/scoring'
import { CATEGORIES, categoryOf, TEAMS } from '../domain/teams'
import type { ScoreRecord } from '../storage/scoreStore'

/** Deliberation view: category standings, proposed Rank 1–5 and the MC sheet. */
export function Results({ records, onBack }: { records: ScoreRecord[]; onBack: () => void }) {
  const sheetsByTeam = new Map<string, ScoreSheet[]>()
  for (const r of records) {
    if (r.status !== 'submitted' || !isComplete(r.sheet)) continue
    sheetsByTeam.set(r.teamId, [...(sheetsByTeam.get(r.teamId) ?? []), r.sheet])
  }
  const standings = CATEGORIES.map((c) => rankCategory(c.id, TEAMS, sheetsByTeam))
  const ranks = proposeRanks(standings)
  const allIn = standings.every((s) => s.missing.length === 0)

  return (
    <div className="screen wide">
      <header className="bar">
        <button className="link" onClick={onBack}>‹ Back</button>
        <div className="bar-title"><strong>Deliberation</strong></div>
      </header>

      {!allIn && <p className="banner">Not all scores are in. Rankings below are provisional.</p>}

      <section className="card">
        <h2>Proposed Rank 1–5</h2>
        <p className="muted small">Category winners ordered by final score. Judges confirm or reorder.</p>
        <table>
          <thead><tr><th>Rank</th><th>Award</th><th>App</th><th>Category</th><th>Final</th></tr></thead>
          <tbody>
            {ranks.map((r) => (
              <tr key={r.rank}>
                <td>{r.rank}</td>
                <td>{r.award}{r.tiedWithAbove && <span className="pill draft">tie</span>}</td>
                <td>{r.winner.team.appName} <span className="muted small">{r.winner.team.university}</span></td>
                <td>{categoryOf(r.winner.team.category).name}</td>
                <td className="num">{r.winner.final}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid">
        {standings.map((s) => (
          <section className="card" key={s.category}>
            <h2>Group {categoryOf(s.category).group}: {categoryOf(s.category).name}</h2>
            {s.tiedAtTop && <p className="banner">Tie after D1 and D4: judges decide.</p>}
            <ol className="standing">
              {s.ranked.map((r) => (
                <li key={r.team.id}>
                  <span>{r.team.appName}</span>
                  <span className="num">{r.final}</span>
                </li>
              ))}
              {s.missing.map((t) => (
                <li key={t.id} className="muted"><span>{t.appName}</span><span>no score</span></li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="card">
        <h2>MC sheet (announcement order)</h2>
        <ol className="mc">
          {announcementOrder(ranks).map((r) => (
            <li key={r.rank}>
              <strong>{r.award}</strong>: {r.winner.team.appName} by {r.winner.team.teamName},{' '}
              {r.winner.team.university} ({categoryOf(r.winner.team.category).name})
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
