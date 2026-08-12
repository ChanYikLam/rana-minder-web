import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetDb, resetOrgDb } from './reset'

class MockServerResponse {
  statusCode = 200
  private captured = ''
  setHeader(): void {}
  end(body: string): void {
    this.captured = body
  }
  get body(): string {
    return this.captured
  }
}

function invokeHandler(urlPattern: string, method: string, reqUrl: string, body?: unknown): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
  const chunks = body === undefined ? [] : [new TextEncoder().encode(JSON.stringify(body))]
  const req = {
    url: reqUrl,
    headers: {},
    [Symbol.asyncIterator]: () => {
      let i = 0
      return {
        next: () =>
          i < chunks.length
            ? Promise.resolve({ done: false, value: chunks[i++] })
            : Promise.resolve({ done: true, value: undefined }),
      }
    },
  }
  const res = new MockServerResponse()
  return (handler.rawResponse(req, res) as Promise<unknown>).then(() => ({
    statusCode: res.statusCode,
    body: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
  }))
}

/** MRM-002 回归：mergePathParams 两层合并必须与 mock-plugin 分发层方向一致——
 * 路径参数优先于同名查询参数（query 不得覆盖路径参数，消除隐性越权契约风险）。 */
describe('MRM-002 mergePathParams 路径参数优先', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetDb()
    resetOrgDb()
  })

  it('GET /api/org/:clubId/context 的查询参数不得覆盖路径参数', async () => {
    // member 用户仅归属 club-001；若 query.clubId 被 ?clubId=club-002 覆盖将 403
    resolveMockUser('/api/auth/session?_mock_user=member')
    const out = await invokeHandler(
      '/api/org/:clubId/context',
      'get',
      '/api/org/club-001/context?clubId=club-002',
    )
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    // 数据域以路径参数 club-001 为准，而非查询参数 club-002
    const data = out.body.data as { clubId: string }
    expect(data.clubId).toBe('club-001')
  })

  it('无冲突时查询参数照常生效，路径参数合并不丢数据', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    const out = await invokeHandler(
      '/api/org/:clubId/context',
      'get',
      '/api/org/club-001/context',
    )
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const data = out.body.data as { clubId: string }
    expect(data.clubId).toBe('club-001')
  })
})
