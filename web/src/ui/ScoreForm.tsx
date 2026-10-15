import type { ReactNode } from 'react'
import type { TimerClock } from '../domain/runOrder'
import { LEVEL_NAMES, SEGMENTS, type Criterion } from '../domain/rubric'
import { finalScore, isComplete, type Level, type PartialSheet } from '../domain/scoring'
import { categoryOf, type Team } from '../domain/teams'
import type { ScoreRecord } from '../storage/scoreStore'
import type { Judge } from '../judges'
import { Header } from './Header'
import { JudgeBadge } from './JudgeBadge'
import { Timer } from './Timer'

const LEVELS: Level[] = [1, 2, 3, 4]

interface Props {
  team: Team
  record: ScoreRecord | undefined
  locked: boolean
  onChange: (change: { sheet?: PartialSheet; note?: string; status?: ScoreRecord['status'] }) => void
  onBack: () => void
  /** Replaces the submit bar, e.g. with the operator's correction form. */
  footer?: ReactNode
  /** Pitch timer set by the operator (this tablet's clock); omit for the judge's own timer. */
  timer?: TimerClock | null
  /** This team is on stage now. */
  onStage?: boolean
  /** Who is scoring on this tablet; shown so tablets are not swapped. */
  judge?: Judge
  /** A submitted sheet cannot change (outside the judges' deliberation). */
  submittedFrozen?: boolean
  /** The next team is already on stage; its sheet opens once this one is submitted. */
  nextUp?: string
}

export function ScoreForm({ team, record, locked, onChange, onBack, footer, timer, onStage, judge, submittedFrozen = false, nextUp }: Props) {
  const sheet = record?.sheet ?? {}
  const complete = isComplete(sheet)
  const submitted = record?.status === 'submitted'
  const frozen = locked || (submitted && submittedFrozen)
  // Changing a submitted sheet makes it a draft again, so the judge submits it again.
  const edit = (change: { sheet?: PartialSheet; note?: string }) => onChange(submitted ? { ...change, status: 'draft' } : change)

  return (
    <div className="screen">
      <Header>
        <button className="link" onClick={onBack}>‹ Teams</button>
        <div className="bar-title">
          <strong>{team.appName}</strong>
          <span className="sub">{onStage && <span className="on-stage">● On stage</span>}{team.teamName} · {team.university} · {categoryOf(team.category).name}</span>
        </div>
        <Timer clock={timer} />
        <div className="final" aria-live="polite">
          <span className="final-num">{complete ? finalScore(sheet) : '–'}</span>
          <span className="sub small">/100</span>
        </div>
      </Header>

      {judge && <JudgeBadge judge={judge} compact />}
      {locked && <p className="banner">This category is closed. Ask the operator to change a score.</p>}

      <p className="muted small rubric-hint">Score what you see and hear in the whole 5 minutes, pitch and video. Between two levels, pick the lower; most teams land on 2 or 3.</p>

      {SEGMENTS.map((seg) => (
        <Section key={seg.title} title={seg.title} subtitle={seg.time}
          criteria={seg.criteria} sheet={sheet} disabled={frozen} onPick={(k, l) => edit({ sheet: { [k]: l } })} />
      ))}

      <label className="note">
        <span>Note (optional, one sentence)</span>
        <input
          type="text"
          defaultValue={record?.note ?? ''}
          disabled={frozen}
          maxLength={200}
          onBlur={(e) => e.target.value !== (record?.note ?? '') && edit({ note: e.target.value })}
        />
      </label>

      <footer className="actions">
        {nextUp && !submitted && !footer && (
          <p className="banner next-up" role="alert">
            <strong>{nextUp} is on stage.</strong> Submit this score first; the next sheet opens after you submit.
          </p>
        )}
        {footer ?? (submitted ? (
          <p className="muted submitted-note">
            {locked ? '✓ Submitted.'
              : submittedFrozen ? '✓ Submitted and locked. Scores can be changed only during the judges\' deliberation.'
              : '✓ Submitted. To change it, tap a new level, then press Submit again.'}
          </p>
        ) : (
          <button className="primary" disabled={!complete || locked} onClick={() => onChange({ status: 'submitted' })}>
            {complete ? 'Submit score' : `Score all 9 criteria (${Object.keys(sheet).length}/9)`}
          </button>
        ))}
      </footer>
    </div>
  )
}

function Section(props: {
  title: string
  subtitle: string
  criteria: Criterion[]
  sheet: PartialSheet
  disabled: boolean
  onPick: (key: Criterion['key'], level: Level) => void
}) {
  return (
    <section className="card">
      <h2>
        {props.title} <span className="muted small">{props.subtitle}</span>
      </h2>
      {props.criteria.map((c) => (
        <CriterionRow key={c.key} c={c} value={props.sheet[c.key]} disabled={props.disabled} onPick={props.onPick} />
      ))}
    </section>
  )
}

/** One criterion: every level shows its descriptor, so the rubric is always in front of the judge. */
function CriterionRow({ c, value, disabled, onPick }: {
  c: Criterion
  value: Level | undefined
  disabled: boolean
  onPick: (key: Criterion['key'], level: Level) => void
}) {
  return (
    <div className="crit">
      <div className="crit-head">
        <span><b>{c.code}</b> {c.name} <span className="muted small">{c.weight}</span></span>
        <span className="crit-question">{c.question}</span>
      </div>
      <div className="levels" role="radiogroup" aria-label={c.name}>
        {LEVELS.map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={value === l}
            className={value === l ? 'level on' : 'level'}
            disabled={disabled}
            onClick={() => onPick(c.key, l)}
          >
            <span className="level-num">{l} <span className="level-name">{LEVEL_NAMES[l]}</span></span>
            <span className="level-desc">{c.levels[l]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
