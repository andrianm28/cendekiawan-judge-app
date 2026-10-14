import { DEMO, LEVEL_NAMES, SOLUTION } from '../domain/rubric'
import { CATEGORIES, teamsIn } from '../domain/teams'
import type { Judge } from '../judges'
import { Header } from './Header'

const ALL = [...SOLUTION, ...DEMO]

/**
 * Paper backup for the day: a one-page rubric card for the judges' brief, and one
 * score sheet per group with the same rubric and formula, in case the tablets fail.
 */
export function PrintSheets({ judges, onBack }: { judges: Judge[]; onBack: () => void }) {
  return (
    <div className="screen wide">
      <div className="no-print">
      <Header>
        <button className="link" onClick={onBack}>‹ Back</button>
        <div className="bar-title"><strong>Print sheets</strong><span className="sub">Rubric card + 5 backup score sheets (A4)</span></div>
        <button className="link" onClick={() => window.print()}>Print / PDF</button>
      </Header>
      </div>

      <section className="print-page">
        <Brand title="Judging rubric · Live demo" />
        <p className="small">Score each criterion 1 Weak · 2 Acceptable · 3 Strong · 4 Exceptional. Solution (D1–D5) and Live Demo (V1–V4) are 50% each.</p>
        <table>
          <thead><tr><th>Criterion</th>{([1, 2, 3, 4] as const).map((l) => <th key={l}>{l} {LEVEL_NAMES[l]}</th>)}</tr></thead>
          <tbody>
            {ALL.map((c) => (
              <tr key={c.key}>
                <td><b>{c.code}</b> {c.name} ({c.weight})</td>
                {([1, 2, 3, 4] as const).map((l) => <td key={l}>{c.levels[l]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <Formula />
      </section>

      {CATEGORIES.map((cat) => {
        const judge = judges.find((j) => j.group === cat.group)
        const teams = teamsIn(cat.id)
        return (
          <section className="print-page" key={cat.id}>
            <Brand title={`Backup score sheet · Group ${cat.group}: ${cat.name}`} />
            <p className="small">Judge: <b>{judge?.name ?? '________________'}</b> · Circle one level per criterion. The operator enters these into the app.</p>
            <table>
              <thead>
                <tr><th>Criterion</th>{teams.map((t) => <th key={t.id}>{t.order}. {t.appName}<br /><span className="small">{t.university}</span></th>)}</tr>
              </thead>
              <tbody>
                {ALL.map((c) => (
                  <tr key={c.key}>
                    <td><b>{c.code}</b> {c.name} ({c.weight})</td>
                    {teams.map((t) => <td key={t.id} className="circle-row">1 2 3 4</td>)}
                  </tr>
                ))}
                <tr><td><b>Final</b> (operator)</td>{teams.map((t) => <td key={t.id} className="fill" />)}</tr>
                <tr><td>Note</td>{teams.map((t) => <td key={t.id} className="fill" />)}</tr>
              </tbody>
            </table>
            <Formula />
            <p className="small">Signature: ____________________ &nbsp; Time: ________</p>
          </section>
        )
      })}
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
      C1 = (D1+D2+D3+D4+D5) / 20 × 100 · C2 = (0.35 V1 + 0.25 V2 + 0.20 V3 + 0.20 V4) / 4 × 100 ·
      Final = ½ C1 + ½ C2, rounded half up (69.5 → 70). Ties: higher D1, then D4, then the judges decide.
    </p>
  )
}
