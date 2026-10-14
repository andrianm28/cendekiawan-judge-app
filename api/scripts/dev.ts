// Local API for trying the app without AWS: in-memory store, fixed demo PINs.
//
//   npm run dev            (API on http://localhost:8787)
//   cd ../web && VITE_API_URL=http://localhost:8787 npm run dev
//
// Demo PINs: judges 111111 … 555555 (Group 1–5), operator 99999999.

import { createServer } from 'node:http'
import { JUDGES } from '../../web/src/judges'
import { hashPin } from '../src/auth'
import { makeHandler } from '../src/handler'
import { JudgingService } from '../src/service'
import { memoryStore } from '../src/store'

const secret = 'local-dev-secret-local-dev-secret!'
const store = memoryStore()
await store.putJudges(JUDGES.map((j) => ({ ...j, pinHash: hashPin(String(j.group).repeat(6)) })))
await store.putAdminPinHash(hashPin('99999999'))
const handle = makeHandler(new JudgingService(store, secret), secret)

const port = Number(process.env.PORT ?? 8787)
createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const r = (await handle({
    requestContext: { http: { method: req.method ?? 'GET' } } as never,
    rawPath: new URL(req.url ?? '/', 'http://x').pathname,
    headers: { authorization: req.headers.authorization ?? '' },
    body: body || undefined,
  })) as { statusCode: number; headers?: Record<string, string>; body?: string }
  res.writeHead(r.statusCode, {
    ...r.headers,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
  })
  res.end(r.body ?? '')
}).listen(port, () => console.log(`API on http://localhost:${port}`))
