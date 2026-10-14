import { CATEGORIES } from '../domain/teams'
import type { Judge } from '../judges'

/** One colour per judge, so a tablet in the wrong hands stands out across the table. */
const JUDGE_COLORS = ['#2f6fdf', '#1f9d55', '#8a3fd1', '#d9480f', '#c2255c'] as const
const judgeColor = (j: Judge) => JUDGE_COLORS[(j.group - 1) % JUDGE_COLORS.length]

const initials = (name: string) =>
  name.replace(/^(Mba|Mbak|Pak|Bu|Ibu|Bapak|Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '')
    .split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || String(1)

export function JudgeAvatar({ judge, size = 40 }: { judge: Judge; size?: number }) {
  return (
    <span className="judge-avatar" style={{ background: judgeColor(judge), width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
      {initials(judge.name)}
    </span>
  )
}

/** "Who is this tablet?" strip on every judge screen. */
export function JudgeBadge({ judge, compact = false }: { judge: Judge; compact?: boolean }) {
  const owns = CATEGORIES.find((c) => c.group === judge.group)
  return (
    <div className={compact ? 'judge-badge compact' : 'judge-badge'} style={{ borderColor: judgeColor(judge) }}>
      <JudgeAvatar judge={judge} size={compact ? 32 : 48} />
      <span className="judge-badge-text">
        <span className="judge-badge-no" style={{ color: judgeColor(judge) }}>Judge {judge.group}</span>
        <strong>{judge.name}</strong>
        {!compact && judge.title && <span className="small">{judge.title}</span>}
        {!compact && owns && <span className="muted small">Owns {owns.name} (decides its winner if tied)</span>}
      </span>
    </div>
  )
}
