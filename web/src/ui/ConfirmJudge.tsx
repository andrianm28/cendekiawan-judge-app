import type { Judge } from '../judges'
import { Header } from './Header'
import { JudgeBadge } from './JudgeBadge'

/** After login: the judge confirms the tablet is theirs before scoring, so PINs or tablets are not swapped. */
export function ConfirmJudge({ judge, onConfirm, onLogout }: { judge: Judge; onConfirm: () => void; onLogout: () => void }) {
  return (
    <div className="screen">
      <Header />
      <div className="confirm-judge">
        <h2>Is this you?</h2>
        <JudgeBadge judge={judge} />
        <p className="muted">Your scores will be saved under this name. If it is not you, log out and enter your own PIN.</p>
        <button className="primary" onClick={onConfirm}>Yes, this is me</button>
        <button className="link" onClick={onLogout}>Not me, log out</button>
      </div>
    </div>
  )
}
