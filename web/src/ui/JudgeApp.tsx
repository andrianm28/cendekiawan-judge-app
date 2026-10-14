import { useCallback, useEffect, useRef, useState } from 'react'
import { CATEGORIES, type Team } from '../domain/teams'
import type { Api, Session } from '../sync/api'
import { syncJudge, type SyncResult } from '../sync/sync'
import { ScoreForm } from './ScoreForm'
import { TeamList } from './TeamList'
import { getStore, useScores } from './useScores'

const EVERY_MS = 5000

/** A judge's tablet when connected to the server: saves locally, syncs in the background. */
export function JudgeApp({ api, session, onLogout }: { api: Api; session: Session; onLogout: () => void }) {
  const { records, save, refresh } = useScores()
  const [team, setTeam] = useState<Team | null>(null)
  const [sync, setSync] = useState<SyncResult | null>(null)
  const [epoch, setEpoch] = useState(0)
  const running = useRef(false)
  const judge = sync?.judge ?? session.judge!

  const round = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const r = await syncJudge(api, await getStore(), judge.id)
      if (r.error === 'unauthorized') return onLogout()
      setSync(r)
      if (r.replaced.length) {
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

  const locked = sync?.closedGroups.includes(judge.group) ?? false
  const status = !sync ? null
    : !sync.online ? <span className="sync wait">Offline · {sync.waiting} saved on tablet</span>
    : sync.waiting ? <span className="sync wait">{sync.waiting} waiting{locked ? ' · group closed' : ''}</span>
    : <span className="sync ok">Synced</span>

  if (team) {
    return (
      <ScoreForm
        key={`${team.id}-${epoch}`}
        team={team}
        record={records.find((r) => r.teamId === team.id && r.judgeId === judge.id)}
        locked={locked}
        onChange={(change) => void save(judge.id, team.id, change).then(() => round())}
        onBack={() => setTeam(null)}
      />
    )
  }
  return (
    <TeamList
      judge={judge}
      category={CATEGORIES[judge.group - 1].id}
      records={records}
      status={status}
      onOpen={setTeam}
      onLogout={onLogout}
    />
  )
}
