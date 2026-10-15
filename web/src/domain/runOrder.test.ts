import { describe, expect, it } from 'vitest'
import { canPutOnStage, canStepBack, DEFAULT_RUN_ORDER, elapsedSeconds, moveInOrder, moveTo, normalizeRunOrder, sameCategoryLayout, stepCurrent, timerClock } from './runOrder'

describe('running order', () => {
  it('defaults to showcase order and repairs a partial or unknown list', () => {
    expect(DEFAULT_RUN_ORDER.order.slice(0, 3)).toEqual(['t01', 't02', 't03'])
    const r = normalizeRunOrder({ order: ['t05', 'x', 't05', 't01'], current: 'nope' })
    expect(r.order.slice(0, 3)).toEqual(['t05', 't01', 't02'])
    expect(r.order).toHaveLength(20)
    expect(r.current).toBeNull()
  })

  it('moves a team inside its category and steps the presenter', () => {
    const r = moveInOrder(DEFAULT_RUN_ORDER, 't02', -1)
    expect(r.order.slice(0, 2)).toEqual(['t02', 't01'])
    expect(moveInOrder(r, 't02', -1)).toBe(r)
    // t05 opens the health block: it cannot move up into education.
    expect(moveInOrder(DEFAULT_RUN_ORDER, 't05', -1)).toBe(DEFAULT_RUN_ORDER)
    const a = { ...r, ...stepCurrent(r, 1) }
    expect(a.current).toBe('t02')
    expect(stepCurrent(a, 1).current).toBe('t01')
    expect(stepCurrent(a, -1).current).toBeNull()
    expect(stepCurrent({ ...r, current: 't20' }, 1).current).toBeNull()
  })

  it('drags a team within its category; a drop outside lands at the edge of its block', () => {
    const down = moveTo(DEFAULT_RUN_ORDER, 't01', 2)
    expect(down.order.slice(0, 5)).toEqual(['t02', 't03', 't01', 't04', 't05'])
    expect(moveTo(DEFAULT_RUN_ORDER, 't01', 10).order.slice(0, 5)).toEqual(['t02', 't03', 't04', 't01', 't05'])
    expect(moveTo(DEFAULT_RUN_ORDER, 't20', 0).order.slice(15)).toEqual(['t16', 't20', 't17', 't18', 't19'])
    expect(moveTo(DEFAULT_RUN_ORDER, 't03', 2)).toBe(DEFAULT_RUN_ORDER)
    expect(moveTo(DEFAULT_RUN_ORDER, 'nope', 0)).toBe(DEFAULT_RUN_ORDER)
    expect(sameCategoryLayout(down.order, DEFAULT_RUN_ORDER.order)).toBe(true)
    expect(sameCategoryLayout(['t05', ...DEFAULT_RUN_ORDER.order.filter((id) => id !== 't05')], DEFAULT_RUN_ORDER.order)).toBe(false)
  })

  it('never steps back into a category the show has left', () => {
    const inHealth = normalizeRunOrder({ current: 't05' })
    expect(inHealth.reached).toBe(1)
    expect(canPutOnStage(inHealth, 't04')).toBe(false)
    expect(canPutOnStage(inHealth, 't08')).toBe(true)
    expect(canStepBack(inHealth)).toBe(false)
    expect(stepCurrent(inHealth, -1).current).toBe('t05')
    expect(canStepBack({ ...inHealth, current: 't06' })).toBe(true)
  })

  it('counts pitch time without the pause', () => {
    const t = timerClock({ ...DEFAULT_RUN_ORDER, current: 't01', startedAt: '2026-10-20T02:00:00Z', pausedAt: '2026-10-20T02:02:00Z', pausedMs: 30_000 })!
    expect(elapsedSeconds(t, Date.parse('2026-10-20T02:10:00Z'))).toBe(90)
    expect(elapsedSeconds({ ...t, pausedAt: null }, Date.parse('2026-10-20T02:03:00Z'))).toBe(150)
    expect(timerClock(DEFAULT_RUN_ORDER)).toBeNull()
  })
})
