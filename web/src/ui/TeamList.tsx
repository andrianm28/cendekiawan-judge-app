import type { ReactNode } from 'react'
import { finalScore, isComplete } from '../domain/scoring'
import { categoryOf, teamsIn, type CategoryId, type Team } from '../domain/teams'
import type { Judge } from '../judges'
import type { ScoreRecord } from '../storage/scoreStore'
import { Header } from './Header'

interface Props {
  judge: Judge
  category: CategoryId
  records: ScoreRecord[]
  onOpen: (team: Team) => void
  onLogout: () => void
  /** Sync chip shown next to the judge's name when the app talks to the server. */
  status?: ReactNode
}

export function TeamList({ judge, category, records, onOpen, onLogout, status }: Props) {
  const cat = categoryOf(category)
  return (
    <div className="screen">
      <Header
        hero={
          <div className="kv" style={{ backgroundImage: `url(/brand/kv-${category}.jpg)` }}>
            <span className="kv-group">Group {cat.group}</span>
            <span className="kv-title">{cat.name}</span>
          </div>
        }
      >
        <div className="bar-title">
          <strong>{judge.name}</strong>
          <span className="sub">4 teams · up to 5 minutes each</span>
        </div>
        {status}
        <button className="link" onClick={onLogout}>Log out</button>
      </Header>
      <ul className="teams">
        {teamsIn(category).map((t) => {
          const r = records.find((x) => x.teamId === t.id && x.judgeId === judge.id)
          const status = !r ? 'Not started' : r.status === 'submitted' ? 'Submitted' : 'Draft'
          return (
            <li key={t.id}>
              <button className="team" onClick={() => onOpen(t)}>
                <span className="order">{t.order}</span>
                <span className="team-name">
                  <strong>{t.appName}</strong>
                  <span className="muted">{t.teamName} · {t.university}</span>
                </span>
                <span className={`pill ${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
                <span className="score">{r && isComplete(r.sheet) ? finalScore(r.sheet) : ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
