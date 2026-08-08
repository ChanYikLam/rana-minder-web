import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { matchRoute } from '../../mock-plugin'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetDb, resetOrgDb } from './reset'
import * as db from './db'

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

function invokeRawBody(urlPattern: string, method: string, reqUrl: string, rawBody: string): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler?.rawResponse) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
  const chunks = [new TextEncoder().encode(rawBody)]
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

describe('P0 严重修复回归（MRM-001/003/004/005/006）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetDb()
    resetOrgDb()
  })

  it('MRM-001：畸形百分号编码 %zz 在路由匹配时不抛 URIError，参数回落为原始片段', () => {
    const handler = { url: '/api/org/:clubId/members', method: 'get', response: () => ({}) }
    expect(() => matchRoute(handler, 'get', '/api/org/%zz/members')).not.toThrow()
    const matched = matchRoute(handler, 'get', '/api/org/%zz/members')
    expect(matched?.params.clubId).toBe('%zz')
    expect(matchRoute(handler, 'get', '/api/org/%E5%85%AC%E4%BC%9A/members')?.params.clubId).toBe('公会')
  })

  it('MRM-003：文件下载不存在返回 404 + IFC-ERR-015（不再用 503 语义的 IFC-ERR-012 触发自动重试）', async () => {
    const out = await invokeHandler('/api/files/:fileId/download', 'post', '/api/files/file-999/download', {})
    expect(out.statusCode).toBe(404)
    expect(out.body.code).toBe('IFC-ERR-015')
    const ok = await invokeHandler('/api/files/:fileId/download', 'post', '/api/files/file-1754112345678-abc123/download', {})
    expect(ok.statusCode).toBe(200)
  })

  it('MRM-003：mock 文件下载不存在同样返回 404 + IFC-ERR-015', async () => {
    const bad = await invokeHandler('/api/mock-files/:fileId', 'get', '/api/mock-files/exp-001.xlsx')
    expect(bad.statusCode).toBe(404)
    expect(bad.body.code).toBe('IFC-ERR-015')
    const good = await invokeHandler('/api/mock-files/:fileId', 'get', '/api/mock-files/file-001.csv')
    expect(good.statusCode).toBe(200)
  })

  it('MRM-004：/api/files/:fileId GET 仅注册一次，且对不存在文件返回 404 + IFC-ERR-015', async () => {
    expect(handlers.filter((h) => h.url === '/api/files/:fileId' && h.method === 'get').length).toBe(1)
    const missing = await invokeHandler('/api/files/:fileId', 'get', '/api/files/file-999')
    expect(missing.statusCode).toBe(404)
    expect(missing.body.code).toBe('IFC-ERR-015')
    const found = await invokeHandler('/api/files/:fileId', 'get', '/api/files/file-1754112345678-abc123')
    expect(found.statusCode).toBe(200)
    const data = found.body.data as { id: string; status: string }
    expect(data.id).toBe('file-1754112345678-abc123')
    expect(data.status).toBe('approved')
  })

  it('MRM-005：移除成员写入 SM-MEM-001 可达状态 exited，而非非法值 removed', async () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit', {
      input: { memberId: 'mem-001', reason: '违反社团章程' },
    })
    expect(out.statusCode).toBe(200)
    const data = out.body.data as { memberId: string; status: string }
    expect(data.status).toBe('exited')
    expect(data.status).not.toBe('removed')
    const member = db.findMember('club-001', 'mem-001')
    expect(member?.status).toBe('exited')
    expect(member?.positions.every((p) => p.status === 'ended')).toBe(true)
  })

  it('MRM-006：rawResponse（测试路径）畸形 JSON 返回 400 + IFC-ERR-017，与 dev server 契约一致', async () => {
    const out = await invokeRawBody('/api/activity/recruitment/:activityId/apply', 'post', '/api/activity/recruitment/act-001/apply', '{"input": {')
    expect(out.statusCode).toBe(400)
    expect(out.body.code).toBe('IFC-ERR-017')
    expect(out.body.message).toBe('请求体 JSON 解析失败')
  })

  it('审计 P2-2：已退出成员不再出现在退出列表，且重复移除被 422 拒绝', async () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const first = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit', {
      input: { memberId: 'mem-001', reason: '违反社团章程' },
    })
    expect(first.statusCode).toBe(200)
    const list = await invokeHandler('/api/org/:clubId/members/exit', 'get', '/api/org/club-001/members/exit')
    const items = list.body.data as { items: { id: string }[] }
    expect(items.items.some((m) => m.id === 'mem-001')).toBe(false)
    const again = await invokeHandler('/api/org/:clubId/members/exit', 'post', '/api/org/club-001/members/exit', {
      input: { memberId: 'mem-001', reason: '重复移除' },
    })
    expect(again.statusCode).toBe(422)
  })
})
