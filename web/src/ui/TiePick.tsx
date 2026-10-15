import { useState } from 'react'
import { categoryOf, TEAMS } from '../domain/teams'
import type { TieSummary } from '../domain/ties'
import { Header } from './Header'

/** The judge who owns a category picks the winner when the top finals are equal. */
export function TiePick({ tie, onPick, onBack }: {
  tie: TieSummary
  onPick: (teamId: string) => Promise<void>
  onBack: () => void
}) {
  const [choice, setChoice] = useState<string | null>(tie.pick)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cat = categoryOf(tie.category)
  return (
    <div className="screen">
      <Header>
        <button className="link" onClick={onBack}>‹ Teams</button>
        <div className="bar-title"><strong>Tie: {cat.name}</strong><span className="sub">You own this category, so you pick its winner</span></div>
      </Header>
      <p className="banner">
        These teams have the same final score averaged across all judges. Choose the category winner.
        D1 and D4 are shown to help; they do not decide.
      </p>
      {error && <p className="banner">{error}</p>}
      <ul className="teams">
        {tie.tied.map((t) => {
          const team = TEAMS.find((x) => x.id === t.teamId)!
          return (
            <li key={t.teamId}>
              <button className={choice === t.teamId ? 'team picked' : 'team'} onClick={() => setChoice(t.teamId)} aria-pressed={choice === t.teamId}>
                <span className="order">{team.order}</span>
                <span className="team-name">
                  <strong>{team.appName}</strong>
                  <span className="muted small">{team.university} · D1 {t.d1} · D4 {t.d4}</span>
                </span>
                <span className="score">{t.final}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <footer className="actions">
        <button className="primary" disabled={!choice || busy || choice === tie.pick} onClick={() => {
          setBusy(true)
          setError('')
          onPick(choice!).then(onBack, (e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false))
        }}>
          {tie.pick && choice === tie.pick ? 'Winner chosen' : choice ? `Choose ${TEAMS.find((x) => x.id === choice)!.appName} as winner` : 'Tap the winning team'}
        </button>
      </footer>
    </div>
  )
}
