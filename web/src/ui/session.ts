import type { Session } from '../sync/api'

const KEY = 'cendekiawan-session'

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
    if (!s) return null
    // drop expired tokens (payload.exp is in seconds)
    const exp = JSON.parse(atob(s.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).exp as number
    return exp * 1000 > Date.now() ? s : null
  } catch {
    return null
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // private mode: the session lasts until the tab closes
  }
}
