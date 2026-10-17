// PIN hashing and signed session tokens. No external auth service: five judge PINs
// and one admin PIN, set before the event with scripts/seed.ts.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export type Role = 'judge' | 'admin'

export interface Session {
  role: Role
  /** Judge id (g1–g5) for judges, "admin" for the operator. */
  sub: string
  /** Expiry, seconds since epoch. */
  exp: number
  /** Fingerprint of the PIN this session logged in with; a new PIN ends the session. */
  key?: string
}

/** Fingerprint of a stored PIN hash: its salt, which every new PIN replaces. */
export const pinKey = (stored: string) => stored.split(':')[0].slice(0, 16)

export function hashPin(pin: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const got = scryptSync(pin, salt, 32)
  const want = Buffer.from(hash, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')

export function signToken(session: Session, secret: string): string {
  const body = b64(JSON.stringify(session))
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

export function verifyToken(token: string, secret: string, now = Date.now()): Session | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = createHmac('sha256', secret).update(body).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session
    return s.exp * 1000 > now ? s : null
  } catch {
    return null
  }
}
