// API Gateway (HTTP API) entry point.
//
//   POST /login                         { pin } → { token, role, judge? }
//   GET  /state                         judge: own sheets; admin: everything
//   PUT  /scores/{teamId}               judge saves a sheet { sheet, note, status, version }
//   PUT  /admin/scores/{judgeId}/{teamId}  operator correction { sheet, note, status, reason }
//   POST /admin/groups/{group}          { closed: boolean }
//   PUT  /admin/judges/{judgeId}        { name }
//   PUT  /admin/deliberation            Deliberation
//   GET  /admin/audit

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { verifyToken, type Session } from './auth'
import { dynamoStore } from './dynamoStore'
import { ApiError, JudgingService } from './service'

const ROUTE_WORDS = ['state', 'scores', 'admin', 'groups', 'judges', 'deliberation', 'audit']

type Event = Pick<APIGatewayProxyEventV2, 'requestContext' | 'headers' | 'body' | 'rawPath'> & {
  requestContext: { http: { method: string } }
}

export function makeHandler(service: JudgingService, secret: string) {
  return async (event: Event): Promise<APIGatewayProxyResultV2> => {
    const method = event.requestContext.http.method
    const parts = event.rawPath.split('/').filter(Boolean)
    try {
      if (method === 'OPTIONS') return reply(204, null)
      const body = event.body ? JSON.parse(event.body) : {}
      if (method === 'POST' && parts[0] === 'login') return reply(200, await service.login(String(body.pin ?? '')))

      const session = auth(event, secret)
      const route = `${method} /${parts.map((p) => (ROUTE_WORDS.includes(p) ? p : ':')).join('/')}`
      switch (route) {
        case 'GET /state':
          return reply(200, await service.state(session))
        case 'PUT /scores/:':
          return reply(200, await service.saveScore(session, parts[1], body))
        case 'PUT /admin/scores/:/:':
          return reply(200, await service.correctScore(session, parts[2], parts[3], body, String(body.reason ?? '')))
        case 'POST /admin/groups/:':
          return reply(200, await service.setGroupClosed(session, Number(parts[2]), body.closed === true))
        case 'PUT /admin/judges/:':
          return reply(200, await service.renameJudge(session, parts[2], String(body.name ?? '')))
        case 'PUT /admin/deliberation':
          return reply(200, await service.putDeliberation(session, body))
        case 'GET /admin/audit':
          return reply(200, await service.listAudit(session))
        default:
          return reply(404, { code: 'not_found', message: 'No such route' })
      }
    } catch (e) {
      if (e instanceof ApiError) return reply(e.status, { code: e.code, message: e.message, current: e.extra })
      if (e instanceof SyntaxError) return reply(400, { code: 'bad_json', message: 'Body is not JSON' })
      console.error(e)
      return reply(500, { code: 'error', message: 'Server error' })
    }
  }
}

function auth(event: Event, secret: string): Session {
  const header = event.headers?.authorization ?? event.headers?.Authorization ?? ''
  const session = verifyToken(header.replace(/^Bearer\s+/i, ''), secret)
  if (!session) throw new ApiError(401, 'unauthorized', 'Please log in again')
  return session
}

function reply(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: body === null ? '' : JSON.stringify(body),
  }
}

const secret = process.env.TOKEN_SECRET ?? ''
if (process.env.TABLE_NAME && secret.length < 32) throw new Error('TOKEN_SECRET must be at least 32 characters')
export const handler = process.env.TABLE_NAME
  ? makeHandler(new JudgingService(dynamoStore(process.env.TABLE_NAME), secret), secret)
  : undefined
