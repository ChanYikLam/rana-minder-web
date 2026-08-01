import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import handlers from './src/mock/index'
import type { MockMethod } from './src/mock/types'

interface MatchedHandler {
  handler: MockMethod
  params: Record<string, string>
  specificity: number
}

function matchRoute(handler: MockMethod, method: string, pathname: string): MatchedHandler | null {
  if (handler.method.toUpperCase() !== method.toUpperCase()) return null

  const names: string[] = []
  const segments = handler.url.split('/').filter(Boolean)
  const pattern = segments.map((segment) => {
    if (segment.startsWith(':')) {
      names.push(segment.slice(1))
      return '([^/]+)'
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('/')
  const match = pathname.match(new RegExp(`^/${pattern}/?$`))
  if (!match) return null

  const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1] || '')]))
  return { handler, params, specificity: segments.length * 10 - names.length }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

export function localMockPlugin(): Plugin {
  return {
    name: 'rana-local-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || '/', 'http://localhost')
        const matched = handlers
          .map((handler) => matchRoute(handler, request.method || 'GET', requestUrl.pathname))
          .filter((entry): entry is MatchedHandler => entry !== null)
          .sort((left, right) => right.specificity - left.specificity)[0]
        if (!matched) {
          next()
          return
        }

        try {
          const searchParams = Object.fromEntries(requestUrl.searchParams.entries())
          const body = request.method === 'GET' || request.method === 'HEAD' ? {} : await readJsonBody(request)
          const result = await matched.handler.response({
            url: requestUrl.pathname + requestUrl.search,
            query: { ...searchParams, ...matched.params },
            body,
            headers: request.headers,
          })
          if (result && typeof result === 'object' && 'statusCode' in result && 'body' in result) {
            const mockResponse = result as { statusCode: number; body: unknown }
            sendJson(response, mockResponse.statusCode, mockResponse.body)
            return
          }
          sendJson(response, 200, result)
        } catch {
          sendJson(response, 500, { code: 'IFC-ERR-016', message: '模拟服务处理失败' })
        }
      })
    },
  }
}
