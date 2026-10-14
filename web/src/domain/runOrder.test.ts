import { describe, expect, it } from 'vitest'
import { DEFAULT_RUN_ORDER, moveInOrder, normalizeRunOrder, stepCurrent } from './runOrder'

describe('running order', () => {
  it('defaults to showcase order and repairs a partial or unknown list', () => {
    expect(DEFAULT_RUN_ORDER.order.slice(0, 3)).toEqual(['t01', 't02', 't03'])
    const r = normalizeRunOrder({ order: ['t05', 'x', 't05', 't01'], current: 'nope' })
    expect(r.order.slice(0, 3)).toEqual(['t05', 't01', 't02'])
    expect(r.order).toHaveLength(20)
    expect(r.current).toBeNull()
  })

  it('moves a team and steps the presenter', () => {
    const r = moveInOrder(DEFAULT_RUN_ORDER, 't02', -1)
    expect(r.order.slice(0, 2)).toEqual(['t02', 't01'])
    expect(moveInOrder(r, 't02', -1)).toBe(r)
    const a = stepCurrent(r, 1)
    expect(a.current).toBe('t02')
    expect(stepCurrent(a, 1).current).toBe('t01')
    expect(stepCurrent(a, -1).current).toBeNull()
    expect(stepCurrent({ ...r, current: 't20' }, 1).current).toBeNull()
  })
})
