import { describe, expect, it } from 'vitest'
import { scoresCsv } from './exportCsv'
import { TEAMS } from './teams'

describe('scoresCsv', () => {
  it('writes one row per sheet with computed scores and escapes text', () => {
    const csv = scoresCsv([
      {
        team: TEAMS[2], judgeName: 'Mba Yashinta',
        sheet: { d1: 3, d2: 3, d3: 3, d4: 4, d5: 2, v1: 4, v2: 3, v4: 2 },
        note: 'Clear, "real" use case, good demo', status: 'submitted', updatedAt: '2026-10-20T02:20:00Z',
      },
      { team: TEAMS[0], judgeName: 'Mba Yashinta', sheet: { d1: 2 }, note: '', status: 'draft', updatedAt: 'x' },
    ])
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Order,Group,Category,University,Team,App,Judge,D1,D2,D3,D4,D5,V1,V2,V4,C1,C2,Final,Status,Note,Updated')
    expect(lines[1]).toBe('1,1,Smart Education,MMU,Virtual Science Lab Assistant,Virtual Science Lab Assistant,Mba Yashinta,2,,,,,,,,,,,draft,,x')
    expect(lines[2]).toBe('3,1,Smart Education,APU,EC 1+1,LangHub,Mba Yashinta,3,3,3,4,2,4,3,2,75,79.69,77,submitted,"Clear, ""real"" use case, good demo",2026-10-20T02:20:00Z')
  })
})
