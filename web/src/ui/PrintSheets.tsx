import { ALL_CRITERIA, LEVEL_NAMES } from '../domain/rubric'
import { CATEGORIES, categoryOf, TEAMS } from '../domain/teams'
import type { Judge } from '../judges'
import { Header } from './Header'

const ALL = ALL_CRITERIA

/**
 * Paper backup for the day: a one-page rubric card for the judges' brief, and one
 * score sheet per judge (all teams, running order) in case the tablets fail.
 */
export function PrintSheets({ judges, order, onBack }: { judges: Judge[]; order?: string[]; onBack: () => void }) {
  const teams = order ? order.map((id) => TEAMS.find((t) => t.id === id)!).filter(Boolean) : TEAMS
  return (
    <div className="screen wide">
      <div className="no-print">
      <Header>
        <button className="link" onClick={onBack}>‹ Back</button>
        <div className="bar-title"><strong>Print sheets</strong><span className="sub">Rubric card + one backup score sheet per judge (A4)</span></div>
        <button className="link" onClick={() => window.print()}>Print / PDF</button>
      </Header>
      </div>

      <section className="print-page">
        <Brand title="Judging rubric · Pitch and demo video" />
        <p className="small">One rubric for the whole 5 minutes, in the order the teams present: problem, solution, demo, impact, closing. Score each criterion 1 Poor · 2 Fair · 3 Good · 4 Excellent from what you see and hear in the pitch and the demo video; the weight is its share of the final. Most criteria land on 2 or 3; give 1 or 4 only when you can point to what earns it.</p>
        <table>
          <thead><tr><th>Criterion</th>{([1, 2, 3, 4] as const).map((l) => <th key={l}>{l} {LEVEL_NAMES[l]}</th>)}</tr></thead>
          <tbody>
            {ALL.map((c) => (
              <tr key={c.key}>
                <td><b>{c.code}</b> {c.name} ({c.weight})<br /><span className="small">{c.question}</span></td>
                {([1, 2, 3, 4] as const).map((l) => <td key={l}>{c.levels[l]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <Formula />
      </section>

      {judges.map((judge) => (
        <section className="print-page" key={judge.id}>
          <Brand title={`Backup score sheet · ${judge.name}`} />
          <p className="small">
            Write one level (1–4) per criterion for each team, in the running order. The operator enters these into the app.
            You own <b>{CATEGORIES.find((c) => c.group === judge.group)?.name}</b>: if its top teams end equal, you choose the winner.
          </p>
          <table className="backup">
            <thead>
              <tr>
                <th>#</th><th>Team</th>
                {ALL.map((c) => <th key={c.key} className="crit-col">{c.code}</th>)}
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t, i) => (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td><b>{t.appName}</b> <span className="small">{t.university} · {categoryOf(t.category).name}</span></td>
                  {ALL.map((c) => <td key={c.key} className="box" />)}
                  <td className="box" />
                </tr>
              ))}
            </tbody>
          </table>
          <Formula />
          <p className="small">Signature: ____________________ &nbsp; Time: ________</p>
        </section>
      ))}
    </div>
  )
}

function Brand({ title }: { title: string }) {
  return (
    <div className="print-brand">
      <div>
        <div className="small">Grand Finale of AWS CendekiAwan Bedrock AI Solution · Universiti Malaya · 20 October 2026</div>
        <h1>{title}</h1>
      </div>
      <img src="/brand/cendekiawan.png" alt="AWS CendekiAwan" />
    </div>
  )
}

function Formula() {
  return (
    <p className="small">
      Final = (10% × (D1+D2+D3+D4+D5) + 17.5% V1 + 12.5% V2 + 10% V3 + 10% V4) ÷ 4 × 100, from 25 to 100,
      rounded half up (69.5 → 70). Each team's final is the average of all judges. A tie at the top of a category is decided by that category's judge.
    </p>
  )
}
