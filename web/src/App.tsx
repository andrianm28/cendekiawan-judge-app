import { useMemo, useState } from 'react'
import { CATEGORIES, TEAMS, type Team } from './domain/teams'
import { JUDGES, type Judge } from './judges'
import { Api, API_URL, type Session } from './sync/api'
import { JudgeApp } from './ui/JudgeApp'
import { Leaderboard } from './ui/Leaderboard'
import { Login } from './ui/Login'
import { OperatorBoard } from './ui/OperatorBoard'
import { PrintSheets } from './ui/PrintSheets'
import { loadSession, saveSession } from './ui/session'
import { Results } from './ui/Results'
import { ScoreForm } from './ui/ScoreForm'
import { TeamList } from './ui/TeamList'
import { Header } from './ui/Header'
import { useScores } from './ui/useScores'

type View = { kind: 'home' } | { kind: 'teams'; judge: Judge } | { kind: 'score'; judge: Judge; team: Team } | { kind: 'results' } | { kind: 'print' } | { kind: 'leaderboard' }

export default function App() {
  return API_URL ? <OnlineApp base={API_URL} /> : <LocalApp />
}

/** Connected mode: PIN login, judges sync to the server, the operator gets the board. */
function OnlineApp({ base }: { base: string }) {
  const [session, setSession] = useState<Session | null>(loadSession)
  const api = useMemo(() => new Api(base, session?.token), [base, session?.token])
  const login = (s: Session | null) => {
    saveSession(s)
    setSession(s)
  }
  const logout = () => login(null)
  if (!session) return <Login api={api} onLogin={login} />
  if (session.role === 'admin') return <OperatorBoard api={api} onLogout={logout} />
  return <JudgeApp api={api} session={session} onLogout={logout} />
}

/** Single-tablet mode (no server): pick a group, everything stays on this device. */
function LocalApp() {
  const [view, setView] = useState<View>({ kind: 'home' })
  const { records, save } = useScores()

  if (view.kind === 'teams') {
    return (
      <TeamList
        judge={view.judge}
        teams={TEAMS}
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
  if (view.kind === 'leaderboard') return <Leaderboard records={records} judges={JUDGES.length} onBack={() => setView({ kind: 'home' })} />
  if (view.kind === 'print') return <PrintSheets judges={JUDGES} onBack={() => setView({ kind: 'home' })} />

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
      <h2 className="section-title">Who is scoring?</h2>
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
      <button className="link print-link" onClick={() => setView({ kind: 'leaderboard' })}>Live leaderboard</button>
      <button className="link print-link" onClick={() => setView({ kind: 'print' })}>Print rubric card and backup sheets</button>
    </div>
  )
}
