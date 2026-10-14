import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_RUN_ORDER } from '../domain/runOrder'
import { categoryOf, TEAMS, type Team } from '../domain/teams'
import type { Api, Session } from '../sync/api'
import { syncJudge, type SyncResult } from '../sync/sync'
import { ScoreForm } from './ScoreForm'
import { TeamList } from './TeamList'
import { TiePick } from './TiePick'
import { getStore, useScores } from './useScores'

const EVERY_MS = 3000

/**
 * A judge's tablet when connected to the server. The operator runs the show: when
 * they put a team on stage the tablet opens its score sheet, and the pitch timer
 * follows theirs. Saves land on the tablet first and sync in the background.
 */
export function JudgeApp({ api, session, onLogout }: { api: Api; session: Session; onLogout: () => void }) {
  const { records, save, refresh } = useScores()
  const [team, setTeam] = useState<Team | null>(null)
  const [tie, setTie] = useState(false)
  const [sync, setSync] = useState<SyncResult | null>(null)
  const [epoch, setEpoch] = useState(0)
  const running = useRef(false)
  const lastCurrent = useRef<string | null | undefined>(undefined)
  const judge = sync?.judge ?? session.judge!

  const round = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const r = await syncJudge(api, await getStore(), judge.id)
      if (r.error === 'unauthorized') return onLogout()
      setSync((prev) => (r.online ? r : { ...r, runOrder: prev?.runOrder, clockOffset: prev?.clockOffset, ties: prev?.ties }))
      if (r.reset) {
        lastCurrent.current = undefined
        setTeam(null)
      }
      if (r.replaced.length || r.reset) {
        await refresh()
        setEpoch((e) => e + 1)
      }
    } finally {
      running.current = false
    }
  }, [api, judge.id, onLogout, refresh])

  useEffect(() => {
    void round()
    const t = setInterval(() => void round(), EVERY_MS)
    return () => clearInterval(t)
  }, [round])

  const runOrder = sync?.runOrder ?? DEFAULT_RUN_ORDER
  // A new team on stage opens its sheet, whatever the judge was looking at.
  useEffect(() => {
    if (!sync?.runOrder) return
    const current = sync.runOrder.current
    if (current === lastCurrent.current) return
    lastCurrent.current = current
    if (current) {
      setTie(false)
      setTeam(TEAMS.find((t) => t.id === current) ?? null)
    }
  }, [sync?.runOrder])

  const teams = runOrder.order.map((id) => TEAMS.find((t) => t.id === id)!).filter(Boolean)
  const closed = (t: Team) => sync?.closedGroups.includes(categoryOf(t.category).group) ?? false
  const myTie = sync?.ties?.[0]
  const status = !sync ? null
    : !sync.online ? <span className="sync wait">Offline · {sync.waiting} saved on tablet</span>
    : sync.waiting ? <span className="sync wait">{sync.waiting} waiting</span>
    : <span className="sync ok">Synced</span>

  if (tie && myTie) {
    return (
      <TiePick
        tie={myTie}
        onPick={async (teamId) => {
          await api.pickTieWinner(myTie.category, teamId)
          await round()
        }}
        onBack={() => setTie(false)}
      />
    )
  }
  if (team) {
    const onStage = team.id === runOrder.current
    const started = onStage && runOrder.startedAt ? Date.parse(runOrder.startedAt) - (sync?.clockOffset ?? 0) : null
    return (
      <ScoreForm
        key={`${team.id}-${epoch}`}
        team={team}
        record={records.find((r) => r.teamId === team.id && r.judgeId === judge.id)}
        locked={closed(team)}
        onStage={onStage}
        timerStartedAt={started}
        onChange={(change) => void save(judge.id, team.id, change).then(() => round())}
        onBack={() => setTeam(null)}
      />
    )
  }
  const onStage = runOrder.current ? TEAMS.find((t) => t.id === runOrder.current) : undefined
  return (
    <TeamList
      judge={judge}
      teams={teams}
      current={runOrder.current}
      records={records}
      status={status}
      onOpen={setTeam}
      onLogout={onLogout}
      notice={
        <>
          {myTie && (
            <button className="banner tie-banner" onClick={() => setTie(true)}>
              {myTie.pick
                ? `Tie in ${categoryOf(myTie.category).name}: you chose ${TEAMS.find((t) => t.id === myTie.pick)?.appName}. Tap to change.`
                : `Tie in ${categoryOf(myTie.category).name}: tap to choose the winner.`}
            </button>
          )}
          <p className="muted small waiting">
            {onStage ? `On stage now: ${onStage.appName}. Its sheet opens automatically.` : 'Waiting for the operator to put the next team on stage. Its sheet opens automatically.'}
          </p>
        </>
      }
    />
  )
}
