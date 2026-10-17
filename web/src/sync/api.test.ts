import { afterEach, describe, expect, it, vi } from 'vitest'
import { Api, TIMEOUT_MS } from './api'

describe('Api', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('gives up on a request that never gets an answer, so the tablet shows Offline', async () => {
    vi.useFakeTimers()
    // A saturated or captive Wi-Fi: the request is accepted and nothing comes back.
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))))
    const pending = new Api('http://api', 'token').state()
    const result = expect(pending).rejects.toThrow('No answer from the server')
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
    await result
  })
})
