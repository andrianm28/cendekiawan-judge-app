import { useEffect, useState } from 'react'

const LIMIT = 5 * 60

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * 5-minute pitch timer: a reminder for the judge, not an enforcer.
 * With `startedAt` (ms on this tablet's clock, or null) it follows the operator's
 * timer and has no buttons; without it the judge taps to start and reset.
 */
export function Timer({ startedAt: driven }: { startedAt?: number | null }) {
  const [own, setOwn] = useState<number | null>(null)
  const startedAt = driven === undefined ? own : driven
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (startedAt === null) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [startedAt])

  if (startedAt === null) {
    if (driven === null) return <span className="timer idle" title="The operator starts the timer">⏱ 5:00</span>
    return <button className="timer" onClick={() => setOwn(Date.now())} aria-label="Start 5-minute timer">⏱ 5:00</button>
  }
  const left = LIMIT - Math.floor((now - startedAt) / 1000)
  const cls = left <= 0 ? 'timer over' : left <= 60 ? 'timer warn' : 'timer on'
  const text = left >= 0 ? fmt(left) : `+${fmt(-left)}`
  if (driven !== undefined) return <span className={cls} aria-live="off">{text}</span>
  return (
    <button className={cls} onClick={() => setOwn(null)} aria-label="Reset timer" aria-live="off">{text}</button>
  )
}
