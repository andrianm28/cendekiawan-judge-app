import { useState } from 'react'
import { CATEGORIES, type Team } from './domain/teams'
import { JUDGES, type Judge } from './judges'
import { Results } from './ui/Results'
import { ScoreForm } from './ui/ScoreForm'
import { TeamList } from './ui/TeamList'
import { useScores } from './ui/useScores'

type View = { kind: 'home' } | { kind: 'teams'; judge: Judge } | { kind: 'score'; judge: Judge; team: Team } | { kind: 'results' }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' })
  const { records, save } = useScores()

  if (view.kind === 'teams') {
    return (
      <TeamList
        judge={view.judge}
        category={CATEGORIES[view.judge.group - 1].id}
        records={records}
        onOpen={(team) => setView({ kind: 'score', judge: view.judge, team })}
        onLogout={() => setView({ kind: 'home' })}
      />
    )
  }
  if (view.kind === 'score') {
    return (
      <ScoreForm
        key={view.team.id}
        team={view.team}
        record={records.find((r) => r.teamId === view.team.id && r.judgeId === view.judge.id)}
        locked={false}
        onChange={(change) => void save(view.judge.id, view.team.id, change)}
        onBack={() => setView({ kind: 'teams', judge: view.judge })}
      />
    )
  }
  if (view.kind === 'results') return <Results records={records} onBack={() => setView({ kind: 'home' })} />

  return (
    <div className="screen">
      <header className="bar"><div className="bar-title"><strong>CendekiAwan Grand Final Judging</strong></div></header>
      <section className="card">
        <h2>Judges</h2>
        <ul className="teams">
          {JUDGES.map((j) => (
            <li key={j.id}>
              <button className="team" onClick={() => setView({ kind: 'teams', judge: j })}>
                <span className="order">{j.group}</span>
                <span className="team-name">
                  <strong>{j.name}</strong>
                  <span className="muted">{CATEGORIES[j.group - 1].name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <button className="primary" onClick={() => setView({ kind: 'results' })}>Deliberation</button>
    </div>
  )
}
