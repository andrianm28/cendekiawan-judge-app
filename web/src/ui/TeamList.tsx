import type { ReactNode } from 'react'
import { finalScore, isComplete } from '../domain/scoring'
import { CATEGORIES, categoryOf, type Team } from '../domain/teams'
import type { Judge } from '../judges'
import type { ScoreRecord } from '../storage/scoreStore'
import { Header } from './Header'
import { JudgeBadge } from './JudgeBadge'

interface Props {
  judge: Judge
  /** Every team, in the running order. */
  teams: Team[]
  records: ScoreRecord[]
  onOpen: (team: Team) => void
  onLogout: () => void
  /** Team on stage now, set by the operator. */
  current?: string | null
  /** Sync chip shown next to the judge's name when the app talks to the server. */
  status?: ReactNode
  /** Shown above the list, e.g. waiting for the next team or a tie to break. */
  notice?: ReactNode
}

export function TeamList({ judge, teams, records, onOpen, onLogout, current, status, notice }: Props) {
  const own = CATEGORIES.find((c) => c.group === judge.group) ?? CATEGORIES[0]
  const done = teams.filter((t) => records.some((r) => r.teamId === t.id && r.judgeId === judge.id && r.status === 'submitted')).length
  return (
    <div className="screen">
      <Header
        hero={
          <div className="kv" style={{ backgroundImage: `url(/brand/kv-${own.id}.jpg)` }}>
            <span className="kv-group">Your category: {own.name}</span>
            <span className="kv-title">All {teams.length} teams</span>
          </div>
        }
      >
        <div className="bar-title">
          <strong>{judge.name}</strong>
          <span className="sub">{done} of {teams.length} submitted · up to 5 minutes each</span>
        </div>
        {status}
        <button className="link" onClick={() => {
          const unsent = records.filter((r) => r.judgeId === judge.id && !r.synced).length
          if (!unsent || window.confirm(`${unsent} ${unsent === 1 ? 'score has' : 'scores have'} not reached the server yet. If you log out now ${unsent === 1 ? 'it stays' : 'they stay'} on this tablet until you log in here again. Log out anyway?`)) onLogout()
        }}>Log out</button>
      </Header>
      <JudgeBadge judge={judge} />
      {notice}
      <ul className="teams">
        {teams.map((t, i) => {
          const r = records.find((x) => x.teamId === t.id && x.judgeId === judge.id)
          const status = !r ? 'Not started' : r.status === 'submitted' ? 'Submitted' : 'Draft'
          const live = t.id === current
          return (
            <li key={t.id}>
              <button className={live ? 'team live' : 'team'} onClick={() => onOpen(t)}>
                {/* Position in the running order, the same number the operator sees. */}
                <span className="order">{i + 1}</span>
                <span className="team-name">
                  <strong>{t.appName}</strong>
                  <span className="muted">
                    {live && <span className="on-stage">● On stage</span>}
                    {categoryOf(t.category).name} · {t.university}
                  </span>
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

