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

/**
 * 解析 multipart/form-data 请求体（表单文件上传）。
 * 浏览器 FormData 无法被 JSON.parse，此处提取分块的字段名/文件名/大小，
 * 以 { input: { name, size, purpose } } 的 JSON 契约传给 mock handler，
 * 与真实后端请求契约保持一致（mock 端点无需感知 multipart 细节）。
 */
export function readMultipartBody(request: IncomingMessage, rawBody: Buffer): Record<string, unknown> {
  const contentType = request.headers['content-type'] || ''
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]
  if (!boundary) return {}
  const separator = Buffer.from(`--${boundary}`)
  const parts = rawBody.toString('latin1').split(separator.toString('latin1'))
  const fields: Record<string, string> = {}
  let fileName = ''
  let fileSize = 0
  for (const part of parts) {
    const endIndex = part.indexOf('\r\n\r\n')
    if (endIndex < 0) continue
    const head = Buffer.from(part.slice(0, endIndex), 'latin1').toString('utf8')
    const body = part.slice(endIndex + 4)
    const nameMatch = head.match(/name="([^"]+)"/)
    if (!nameMatch) continue
    const fieldName = nameMatch[1]
    const filenameMatch = head.match(/filename="([^"]*)"/)
    if (filenameMatch && filenameMatch[1]) {
      fileName = filenameMatch[1]
      fileSize = Buffer.from(body.replace(/\r\n$/, ''), 'latin1').length
    } else {
      fields[fieldName] = body.replace(/\r\n$/, '')
    }
  }
  const input: Record<string, unknown> = {}
  if (fileName) input.name = fileName
  if (fileSize > 0) input.size = fileSize
  if (fields.purpose) input.purpose = fields.purpose
  return Object.keys(input).length > 0 ? { input } : { ...fields }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

/** 支持字符串体与自定义响应头的响应输出（用于模拟文件下载等场景） */
function sendMockResponse(response: ServerResponse, status: number, body: unknown, headers?: Record<string, string>): void {
  response.statusCode = status
  for (const [key, value] of Object.entries(headers || {})) response.setHeader(key, value)
  if (typeof body === 'string') {
    if (!response.getHeader('Content-Type')) response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end(body)
    return
  }
  if (!response.getHeader('Content-Type')) response.setHeader('Content-Type', 'application/json; charset=utf-8')
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
          let body: unknown = {}
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            const chunks: Uint8Array[] = []
            for await (const chunk of request) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
            }
            const rawBody = Buffer.concat(chunks)
            const contentType = request.headers['content-type'] || ''
            body = contentType.includes('multipart/form-data')
              ? readMultipartBody(request, rawBody)
              : rawBody.length === 0
                ? {}
                : JSON.parse(rawBody.toString('utf8'))
          }
          const result = await matched.handler.response({
            url: requestUrl.pathname + requestUrl.search,
            query: { ...searchParams, ...matched.params },
            body,
            headers: request.headers,
          })
          if (result && typeof result === 'object' && 'statusCode' in result && 'body' in result) {
            const mockResponse = result as { statusCode: number; body: unknown; headers?: Record<string, string> }
            sendMockResponse(response, mockResponse.statusCode, mockResponse.body, mockResponse.headers)
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
