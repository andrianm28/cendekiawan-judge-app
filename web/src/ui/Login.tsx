import { useState } from 'react'
import { ApiError, type Api, type Session } from '../sync/api'
import { Header } from './Header'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

/** PIN pad. Each judge's PIN opens their own group; the operator PIN opens the board. */
export function Login({ api, onLogin }: { api: Api; onLogin: (s: Session) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const press = (k: string) => {
    setError('')
    if (k === '⌫') setPin(pin.slice(0, -1))
    else if (k && pin.length < 8) setPin(pin + k)
  }
  const submit = async () => {
    setBusy(true)
    try {
      onLogin(await api.login(pin))
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Wrong PIN. Try again.'
        : e instanceof ApiError && e.code === 'too_many_tries' ? e.message
        : 'Cannot reach the server. Check the Wi-Fi and try again.')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <Header
        hero={
          <div className="hero">
            <span className="eyebrow">Grand Finale of AWS CendekiAwan Bedrock AI Solution</span>
            <h1>Judging</h1>
            <span className="sub">Universiti Malaya · Tuesday, 20 October 2026</span>
          </div>
        }
      />
      <form className="login" onSubmit={(e) => { e.preventDefault(); if (pin.length >= 4) void submit() }}>
        <h2 className="section-title">Enter your PIN</h2>
        <div className="pin-dots" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: Math.max(6, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? 'dot on' : 'dot'} />)}
        </div>
        {error && <p className="banner" role="alert">{error}</p>}
        <div className="pinpad">
          {KEYS.map((k, i) => (
            <button type="button" key={i} className="pin-key" disabled={!k || busy} aria-label={k === '⌫' ? 'Delete' : k}
              onClick={() => press(k)}>{k}</button>
          ))}
        </div>
        <button className="primary" type="submit" disabled={pin.length < 4 || busy}>{busy ? 'Checking…' : 'Log in'}</button>
      </form>
    </div>
  )
}
