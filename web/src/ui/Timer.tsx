import { useEffect, useState } from 'react'

const LIMIT = 5 * 60

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Optional 5-minute pitch timer: a reminder for the judge, not an enforcer. Tap to start, tap again to reset. */
export function Timer() {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [startedAt])

  if (startedAt === null) {
    return <button className="timer" onClick={() => { setStartedAt(Date.now()); setNow(Date.now()) }} aria-label="Start 5-minute timer">⏱ 5:00</button>
  }
  const left = LIMIT - Math.floor((now - startedAt) / 1000)
  const cls = left <= 0 ? 'timer over' : left <= 60 ? 'timer warn' : 'timer on'
  return (
    <button className={cls} onClick={() => setStartedAt(null)} aria-label="Reset timer" aria-live="off">
      {left >= 0 ? fmt(left) : `+${fmt(-left)}`}
    </button>
  )
}
