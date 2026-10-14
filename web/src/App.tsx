import { useState } from 'react'
import { CATEGORIES, type Team } from './domain/teams'
import { JUDGES, type Judge } from './judges'
import { Results } from './ui/Results'
import { ScoreForm } from './ui/ScoreForm'
import { TeamList } from './ui/TeamList'
import { Header } from './ui/Header'
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
      <Header
        hero={
          <div className="hero">
            <span className="eyebrow">Grand Finale of AWS CendekiAwan Bedrock AI Solution</span>
            <h1>Judging</h1>
            <span className="sub">Universiti Malaya · Tuesday, 20 October 2026</span>
          </div>
        }
      />
      <h2 className="section-title">Choose your group</h2>
      <ul className="groups">
        {JUDGES.map((j) => {
          const cat = CATEGORIES[j.group - 1]
          return (
            <li key={j.id}>
              <button className="group-card" onClick={() => setView({ kind: 'teams', judge: j })}>
                <span className="group-kv" style={{ backgroundImage: `url(/brand/kv-${cat.id}.jpg)` }} />
                <span className="group-text">
                  <span className="eyebrow">Group {j.group}</span>
                  <strong>{cat.name}</strong>
                  <span className="muted">{j.name}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button className="primary" onClick={() => setView({ kind: 'results' })}>Deliberation</button>
    </div>
  )
}
