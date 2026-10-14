import type { ReactNode } from 'react'
import { DEMO, LEVEL_NAMES, SOLUTION, type Criterion } from '../domain/rubric'
import { c1, c2, finalScore, isComplete, type Level, type PartialSheet } from '../domain/scoring'
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
  /** Pitch timer start set by the operator (this tablet's clock); omit for the judge's own timer. */
  timerStartedAt?: number | null
  /** This team is on stage now. */
  onStage?: boolean
  /** Who is scoring on this tablet; shown so tablets are not swapped. */
  judge?: Judge
}

export function ScoreForm({ team, record, locked, onChange, onBack, footer, timerStartedAt, onStage, judge }: Props) {
  const sheet = record?.sheet ?? {}
  const complete = isComplete(sheet)
  const submitted = record?.status === 'submitted'

  return (
    <div className="screen">
      <Header>
        <button className="link" onClick={onBack}>‹ Teams</button>
        <div className="bar-title">
          <strong>{team.appName}</strong>
          <span className="sub">{onStage && <span className="on-stage">● On stage</span>}{team.teamName} · {team.university} · {categoryOf(team.category).name}</span>
        </div>
        <Timer startedAt={timerStartedAt} />
        <div className="final" aria-live="polite">
          <span className="final-num">{complete ? finalScore(sheet) : '–'}</span>
          <span className="sub small">/100</span>
        </div>
      </Header>

      {judge && <JudgeBadge judge={judge} compact />}
      {locked && <p className="banner">This category is closed. Ask the operator to change a score.</p>}

      <Section title="Solution" subtitle={complete ? `C1 ${c1(sheet)}` : '50%'}
        criteria={SOLUTION} sheet={sheet} disabled={locked} onPick={(k, l) => onChange({ sheet: { [k]: l } })} />
      <Section title="Live Demo" subtitle={complete ? `C2 ${c2(sheet)}` : '50%'}
        criteria={DEMO} sheet={sheet} disabled={locked} onPick={(k, l) => onChange({ sheet: { [k]: l } })} />

      <label className="note">
        <span>Note (optional, one sentence)</span>
        <input
          type="text"
          defaultValue={record?.note ?? ''}
          disabled={locked}
          maxLength={200}
          onBlur={(e) => e.target.value !== (record?.note ?? '') && onChange({ note: e.target.value })}
        />
      </label>

      <footer className="actions">
        {footer ?? (submitted ? (
          <p className="muted">Submitted. You can still change scores until the category is closed.</p>
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
