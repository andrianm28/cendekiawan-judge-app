import { finalScore, isComplete } from '../domain/scoring'
import { categoryOf, teamsIn, type CategoryId, type Team } from '../domain/teams'
import type { Judge } from '../judges'
import type { ScoreRecord } from '../storage/scoreStore'

interface Props {
  judge: Judge
  category: CategoryId
  records: ScoreRecord[]
  onOpen: (team: Team) => void
  onLogout: () => void
}

export function TeamList({ judge, category, records, onOpen, onLogout }: Props) {
  const cat = categoryOf(category)
  return (
    <div className="screen">
      <header className="bar">
        <div className="bar-title">
          <strong>Group {cat.group}: {cat.name}</strong>
          <span className="muted">{judge.name}</span>
        </div>
        <button className="link" onClick={onLogout}>Log out</button>
      </header>
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
