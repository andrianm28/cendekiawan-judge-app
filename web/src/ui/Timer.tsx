import { useEffect, useState } from 'react'
import { elapsedSeconds, type TimerClock } from '../domain/runOrder'

const LIMIT = 5 * 60

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * 5-minute pitch timer: a reminder for the judge, not an enforcer.
 * With `clock` (on this device's clock, or null when not started) it follows the
 * operator's timer, including a pause between the deck and the video, and has no
 * buttons; without it the judge taps to start and reset.
 */
export function Timer({ clock: driven }: { clock?: TimerClock | null }) {
  const [own, setOwn] = useState<number | null>(null)
  const clock = driven === undefined ? (own === null ? null : { startedAt: own, pausedAt: null, pausedMs: 0 }) : driven
  const running = !!clock && clock.pausedAt === null
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [running, clock?.startedAt, clock?.pausedAt, clock?.pausedMs])

  if (!clock) {
    if (driven === null) return <span className="timer idle" title="The operator starts the timer">⏱ 5:00</span>
    return <button className="timer" onClick={() => setOwn(Date.now())} aria-label="Start 5-minute timer">⏱ 5:00</button>
  }
  const left = LIMIT - elapsedSeconds(clock, now)
  const paused = clock.pausedAt !== null
  const cls = paused ? 'timer paused' : left <= 0 ? 'timer over' : left <= 60 ? 'timer warn' : 'timer on'
  const text = `${paused ? '⏸ ' : ''}${left >= 0 ? fmt(left) : `+${fmt(-left)}`}`
  if (driven !== undefined) return <span className={cls} aria-live="off" title={paused ? 'Paused' : undefined}>{text}</span>
  return (
    <button className={cls} onClick={() => setOwn(null)} aria-label="Reset timer" aria-live="off">{text}</button>
  )
}
