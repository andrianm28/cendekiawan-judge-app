import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { moveTo, type RunOrder } from '../domain/runOrder'
import { categoryOf, TEAMS } from '../domain/teams'

/**
 * The running order as a drag-and-drop list. Drag a row by its handle (mouse, pen or
 * touch) and drop it where the team should present; the new order is saved on drop.
 * With the handle focused, the arrow keys move the team one place.
 */
export function RunOrderList({ run, scored, judges, onReorder, onStage }: {
  run: RunOrder
  scored: (teamId: string) => number
  judges: number
  onReorder: (order: string[]) => void
  onStage: (teamId: string) => void
}) {
  const [order, setOrder] = useState(run.order)
  const [dragging, setDragging] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const startOrder = useRef<string[]>([])

  // Follow the server unless the operator is mid-drag.
  useEffect(() => {
    if (!dragging) setOrder(run.order)
  }, [run.order, dragging])

  const begin = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    startOrder.current = order
    setDragging(id)
  }

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging || !listRef.current) return
    const rows = [...listRef.current.querySelectorAll<HTMLLIElement>('li[data-id]')]
    // The slot is the first row whose middle is below the pointer.
    let to = rows.findIndex((row) => {
      const box = row.getBoundingClientRect()
      return e.clientY < box.top + box.height / 2
    })
    if (to < 0) to = rows.length - 1
    const from = order.indexOf(dragging)
    if (to > from) to -= 1
    setOrder((o) => moveTo({ order: o, current: null, startedAt: null }, dragging, to).order)
  }

  const end = () => {
    if (!dragging) return
    setDragging(null)
    if (order.join() !== startOrder.current.join()) onReorder(order)
  }

  const key = (e: KeyboardEvent<HTMLButtonElement>, id: string, i: number) => {
    const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!delta) return
    e.preventDefault()
    const next = moveTo({ order, current: null, startedAt: null }, id, i + delta).order
    if (next !== order) {
      setOrder(next)
      onReorder(next)
    }
  }

  return (
    <ol className={`run-list${dragging ? ' is-dragging' : ''}`} ref={listRef}>
      {order.map((id, i) => {
        const t = TEAMS.find((x) => x.id === id)!
        const cls = [id === run.current ? 'live' : '', id === dragging ? 'dragging' : ''].filter(Boolean).join(' ')
        return (
          <li key={id} data-id={id} className={cls || undefined}>
            <button
              className="drag-handle"
              aria-label={`Drag ${t.appName} to reorder (or use arrow keys)`}
              title="Drag to reorder"
              onPointerDown={(e) => begin(e, id)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => key(e, id, i)}
            >⠿</button>
            <span className="run-pos">{i + 1}</span>
            <span className="run-name"><strong>{t.appName}</strong> <span className="muted small">{categoryOf(t.category).name} · {scored(id)}/{judges} scored</span></span>
            <button className="secondary" disabled={id === run.current} onClick={() => onStage(id)}>On stage</button>
          </li>
        )
      })}
    </ol>
  )
}
