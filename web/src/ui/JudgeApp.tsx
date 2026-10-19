import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_RUN_ORDER, showFinished, timerClock } from '../domain/runOrder'
import { categoryOf, TEAMS, type Team } from '../domain/teams'
import type { Api, Session } from '../sync/api'
import { syncJudge, type SyncResult } from '../sync/sync'
import { JudgeBrief } from './JudgeBrief'
import { ScoreForm } from './ScoreForm'
import { TeamList } from './TeamList'
import { TiePick } from './TiePick'
import { getStore, useScores } from './useScores'

const EVERY_MS = 3000
const NO_STORAGE = 'This browser cannot save scores on the tablet (private browsing or blocked website data). Use another browser, or score on the paper sheet and tell the operator.'
const ABSENT_NOTE = 'The operator marked you absent, so your scores do not count. Ask the operator if this is wrong.'

/**
 * A judge's tablet when connected to the server. The operator runs the show: when
 * they put a team on stage the tablet opens its score sheet, and the pitch timer
 * follows theirs. Saves land on the tablet first and sync in the background.
 */
export function JudgeApp({ api, session, onLogout }: { api: Api; session: Session; onLogout: () => void }) {
  const { records, loaded, save, refresh } = useScores()
  const [noStorage, setNoStorage] = useState(false)
  const [team, setTeam] = useState<Team | null>(null)
  const [tie, setTie] = useState(false)
  /** Team put on stage while the judge still had the previous team's sheet unsubmitted. */
  const [waitingNext, setWaitingNext] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncResult | null>(null)
  const [epoch, setEpoch] = useState(0)
  const running = useRef(false)
  const lastCurrent = useRef<string | null | undefined>(undefined)
  const openTeam = useRef<string | null>(null)
  const judge = sync?.judge ?? session.judge!

  const round = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const store = await getStore().catch(() => null)
      if (!store) return setNoStorage(true)
      const r = await syncJudge(api, store, judge.id)
      if (r.error === 'unauthorized') return onLogout()
      setSync((prev) => (r.online ? r : { ...r, runOrder: prev?.runOrder, clockOffset: prev?.clockOffset, ties: prev?.ties }))
      if (r.reset) {
        lastCurrent.current = undefined
        setTeam(null)
      }
      if (r.replaced.length || r.reset) {
        await refresh()
        // Remount the open sheet only when its own record changed, so a correction to
        // another team does not wipe a note the judge is still typing.
        if (r.reset || (openTeam.current && r.replaced.includes(openTeam.current))) setEpoch((e) => e + 1)
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

  openTeam.current = team?.id ?? null
  const runOrder = sync?.runOrder ?? DEFAULT_RUN_ORDER
  const submittedHere = (teamId: string) =>
    records.some((r) => r.teamId === teamId && r.judgeId === judge.id && r.status === 'submitted')
  const closedTeam = (id: string) => {
    const t = TEAMS.find((x) => x.id === id)
    return !!t && !!sync?.closedGroups.includes(categoryOf(t.category).group)
  }
  /** A sheet this judge still owes: not submitted, and its category still open. */
  const owed = (id: string | null | undefined): id is string => !!id && !submittedHere(id) && !closedTeam(id)
  // A new team on stage opens its sheet, whatever the judge was looking at, except that a
  // sheet the judge still owes comes first: the team that just pitched, or the earlier one
  // the tablet is already holding them on. After a reload the tablet remembers nothing, so
  // it takes the earliest team before the one on stage with a draft started here.
  // Going back (the operator's Previous) leaves an unsubmitted sheet open.
  useEffect(() => {
    if (!sync?.runOrder || !loaded) return
    const current = sync.runOrder.current
    if (current === lastCurrent.current) return
    const previous = lastCurrent.current
    lastCurrent.current = current
    if (!current) return
    setTie(false)
    const order = sync.runOrder.order
    const at = order.indexOf(current)
    const open = team?.id
    if (previous !== undefined && previous !== null && order.indexOf(previous) > at) {
      if (owed(open) || submittedHere(current)) {
        setWaitingNext(null)
        return
      }
    } else if (!sync.absent) {
      const draftBefore = previous === undefined
        ? order.slice(0, Math.max(at, 0)).find((id) => owed(id) && records.some((r) => r.teamId === id && r.judgeId === judge.id))
        : undefined
      const pending = waitingNext && owed(open) ? open : previous && owed(previous) ? previous : draftBefore
      if (pending && pending !== current) {
        setTeam(TEAMS.find((t) => t.id === pending) ?? null)
        setWaitingNext(current)
        return
      }
    }
    setWaitingNext(null)
    setTeam(TEAMS.find((t) => t.id === current) ?? null)
  }, [sync?.runOrder, loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  // Once that sheet is submitted, open the team on stage now.
  useEffect(() => {
    if (!waitingNext || !team || !submittedHere(team.id)) return
    const now = sync?.runOrder?.current ?? waitingNext
    setWaitingNext(null)
    setTeam(TEAMS.find((t) => t.id === now) ?? null)
  }, [records, waitingNext]) // eslint-disable-line react-hooks/exhaustive-deps

  const teams = runOrder.order.map((id) => TEAMS.find((t) => t.id === id)!).filter(Boolean)
  const closed = (t: Team) => sync?.closedGroups.includes(categoryOf(t.category).group) ?? false
  const myTie = sync?.ties?.[0]
  const status = !sync ? null
    : !sync.online ? <span className="sync wait">Offline · {sync.waiting} saved on tablet</span>
    : sync.rejected ? <span className="sync wait">{sync.rejected} not accepted · tell the operator</span>
    : sync.waiting ? <span className="sync wait">{sync.waiting} waiting</span>
    : <span className="sync ok">Synced</span>

  if (noStorage) return <div className="screen"><p className="banner" role="alert">{NO_STORAGE}</p></div>

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
    return (
      <ScoreForm
        key={`${team.id}-${epoch}`}
        team={team}
        record={records.find((r) => r.teamId === team.id && r.judgeId === judge.id)}
        locked={closed(team) || !!sync?.absent}
        lockedReason={sync?.absent ? ABSENT_NOTE : sync?.locked ? 'The result is locked. Scores can no longer change.' : undefined}
        onStage={onStage}
        judge={judge}
        timer={onStage ? timerClock(runOrder, sync?.clockOffset ?? 0) : null}
        submittedFrozen={!runOrder.deliberation}
        nextUp={waitingNext ? TEAMS.find((t) => t.id === waitingNext)?.appName : undefined}
        onChange={(change) => void save(judge.id, team.id, change).then(() => round())}
        onBack={() => { setWaitingNext(null); setTeam(null) }}
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
          {sync?.absent && <p className="banner">{ABSENT_NOTE}</p>}
          {myTie && (
            <button className="banner tie-banner" onClick={() => setTie(true)}>
              {myTie.pick
                ? `Tie in ${categoryOf(myTie.category).name}: you chose ${TEAMS.find((t) => t.id === myTie.pick)?.appName}. Tap to change.`
                : `Tie in ${categoryOf(myTie.category).name}: tap to choose the winner.`}
            </button>
          )}
          <JudgeBrief />
          <p className="muted small waiting">
            {onStage ? `On stage now: ${onStage.appName}. Its sheet opens automatically.`
              : showFinished(runOrder) ? 'All teams have presented. Wait for the operator to open the judges\' deliberation.'
              : 'Waiting for the operator to put the next team on stage. Its sheet opens automatically.'}
          </p>
        </>
      }
    />
  )
}
