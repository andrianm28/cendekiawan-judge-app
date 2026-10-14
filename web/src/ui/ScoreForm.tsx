import { useState } from 'react'
import { DEMO, LEVEL_NAMES, SOLUTION, type Criterion } from '../domain/rubric'
import { c1, c2, finalScore, isComplete, type Level, type PartialSheet } from '../domain/scoring'
import type { Team } from '../domain/teams'
import type { ScoreRecord } from '../storage/scoreStore'

const LEVELS: Level[] = [1, 2, 3, 4]

interface Props {
  team: Team
  record: ScoreRecord | undefined
  locked: boolean
  onChange: (change: { sheet?: PartialSheet; note?: string; status?: ScoreRecord['status'] }) => void
  onBack: () => void
}

export function ScoreForm({ team, record, locked, onChange, onBack }: Props) {
  const sheet = record?.sheet ?? {}
  const complete = isComplete(sheet)
  const submitted = record?.status === 'submitted'

  return (
    <div className="screen">
      <header className="bar">
        <button className="link" onClick={onBack}>‹ Teams</button>
        <div className="bar-title">
          <strong>{team.appName}</strong>
          <span className="muted">{team.teamName} · {team.university}</span>
        </div>
        <div className="final" aria-live="polite">
          <span className="final-num">{complete ? finalScore(sheet) : '–'}</span>
          <span className="muted small">/100</span>
        </div>
      </header>

      {locked && <p className="banner">This group is closed. Ask the operator to change a score.</p>}

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
        {submitted ? (
          <p className="muted">Submitted. You can still change scores until the group is closed.</p>
        ) : (
          <button className="primary" disabled={!complete || locked} onClick={() => onChange({ status: 'submitted' })}>
            {complete ? 'Submit score' : `Score all 9 criteria (${Object.keys(sheet).length}/9)`}
          </button>
        )}
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

function CriterionRow({ c, value, disabled, onPick }: {
  c: Criterion
  value: Level | undefined
  disabled: boolean
  onPick: (key: Criterion['key'], level: Level) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="crit">
      <button className="crit-head link" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><b>{c.code}</b> {c.name} <span className="muted small">{c.weight}</span></span>
        <span className="muted small">{open ? 'hide' : 'guide'}</span>
      </button>
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
            <span className="level-num">{l}</span>
            <span className="level-name">{LEVEL_NAMES[l]}</span>
          </button>
        ))}
      </div>
      {open && (
        <ol className="guide">
          {LEVELS.map((l) => (
            <li key={l} className={value === l ? 'on' : ''}><b>{l}</b> {c.levels[l]}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
