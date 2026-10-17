import { describe, expect, it } from 'vitest'
import { APP_LINKS, shortUrl } from './appLinks'
import { TEAMS } from './teams'

describe('app links', () => {
  it('only names teams that exist', () => {
    const ids = new Set(TEAMS.map((t) => t.id))
    for (const id of Object.keys(APP_LINKS)) expect(ids).toContain(id)
  })

  it('are absolute http(s) URLs', () => {
    for (const url of Object.values(APP_LINKS)) expect(new URL(url!).protocol).toMatch(/^https?:$/)
  })

  it('shortens a link for display', () => {
    expect(shortUrl('https://dewanai.my/')).toBe('dewanai.my')
    expect(shortUrl('http://a.example.com/app')).toBe('a.example.com/app')
  })
})
