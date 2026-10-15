import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_RUN_ORDER, timerClock } from '../domain/runOrder'
import { categoryOf, TEAMS, type Team } from '../domain/teams'
import type { Api, ServerState } from '../sync/api'
import { Timer } from './Timer'

const EVERY_MS = 1000

const UNIVERSITY: Record<Team['university'], string> = {
  APU: 'Asia Pacific University',
  MMU: 'Multimedia University',
  Nilai: 'Nilai University',
  UM: 'Universiti Malaya',
}

/**
 * Audience screen for the venue LED, public at /?screen=stage (no login), also opened
 * from the operator board in its own window:
 * the team on stage, its category, the pitch timer and who is up next. It follows the
 * operator's controls and never shows scores or the leaderboard.
 */
export function StageScreen({ api }: { api: Api }) {
  const [state, setState] = useState<Pick<ServerState, 'runOrder' | 'serverTime'> | null>(null)
  const [offline, setOffline] = useState(false)
  const [asked, setAsked] = useState(Date.now())

  const refresh = useCallback(async () => {
    const sent = Date.now()
    try {
      const s = await api.stage()
      setState(s)
      setAsked(Math.round((sent + Date.now()) / 2))
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [api])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), EVERY_MS)
    return () => clearInterval(t)
  }, [refresh])

  const run = state?.runOrder ?? DEFAULT_RUN_ORDER
  const order = run.order.length ? run.order : TEAMS.map((t) => t.id)
  const team = TEAMS.find((t) => t.id === run.current)
  const position = team ? order.indexOf(team.id) : -1
  const next = TEAMS.find((t) => t.id === order[team ? position + 1 : 0])
  const offset = state ? Date.parse(state.serverTime) - asked : 0
  const cat = team ? categoryOf(team.category) : undefined

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }

  return (
    <div className="stage-screen" onDoubleClick={fullscreen}>
      {cat && <div className="stage-bg" style={{ backgroundImage: `url(/brand/kv-${cat.id}.jpg)` }} />}
      <header className="stage-top">
        <img src="/brand/cendekiawan-white.png" alt="AWS CendekiAwan" className="stage-logo" />
        <span className="stage-event">Grand Finale of AWS CendekiAwan Bedrock AI Solution</span>
        <span className="stage-partners">
          <img src="/brand/aws-white.png" alt="AWS" />
          <img src="/brand/elitery-white.png" alt="Elitery" />
        </span>
      </header>

      {team && cat ? (
        <main className="stage-main">
          <span className="stage-eyebrow">Now presenting · Team {position + 1} of {order.length}</span>
          <span className="stage-category">{cat.name}</span>
          <h1 className="stage-app">{team.appName}</h1>
          <p className="stage-team-line">
            {team.teamName !== team.appName && <><strong>{team.teamName}</strong> · </>}
            {UNIVERSITY[team.university]}
          </p>
          <div className="stage-clock">
            <Timer clock={timerClock(run, offset)} />
            <span className="stage-clock-label">{!run.startedAt ? 'Pitch starts soon' : run.pausedAt ? 'Paused' : '5-minute pitch'}</span>
          </div>
        </main>
      ) : (
        <main className="stage-main idle">
          <span className="stage-eyebrow">Universiti Malaya · Tuesday, 20 October 2026</span>
          <h1 className="stage-app">Grand Finale</h1>
          <p className="stage-team-line">{order.length} finalist teams · 5 categories</p>
        </main>
      )}

      <footer className="stage-bottom">
        {next ? (
          <span><span className="stage-next-label">Up next</span> {next.appName} · {UNIVERSITY[next.university]} · {categoryOf(next.category).name}</span>
        ) : <span>{team ? 'Last presentation' : ''}</span>}
        {offline && <span className="stage-offline">Reconnecting…</span>}
      </footer>
    </div>
  )
}
