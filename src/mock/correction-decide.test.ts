import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections } from './reset'

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

const listUrl = '/api/admin/audit/corrections'
const listPattern = '/api/admin/audit/corrections'
const decidePattern = '/api/admin/audit/corrections/:correctionId/decide'
const withdrawPattern = '/api/admin/audit/corrections/:correctionId/withdraw'

interface CorrectionItem { id: string; status: string; reason: string; submitterName: string }

/** 回归：管理员纠错处置点击批准/拒绝后列表状态无变化（bug：admin 版 handler 不落库、列表硬编码） */
describe('管理员事实纠错处置（decide 真实落库）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
  })

  it('批准后列表状态变为 approved，按钮消失依据（status 变化）', async () => {
    const list = await invokeHandler(listPattern, 'get', listUrl)
    expect(list.statusCode).toBe(200)
    const items = (list.body.data as { items: CorrectionItem[] }).items
    const target = items.find((i) => i.status === 'submitted')
    expect(target, '种子数据应含 submitted 纠错').toBeTruthy()

    const out = await invokeHandler(decidePattern, 'post', `${listUrl}/${target!.id}/decide`, { input: { decision: 'approve' } })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect((out.body.data as { status: string }).status).toBe('approved')

    const after = await invokeHandler(listPattern, 'get', listUrl)
    const afterItems = (after.body.data as { items: CorrectionItem[] }).items
    const updated = afterItems.find((i) => i.id === target!.id)
    expect(updated?.status).toBe('approved')
  })

  it('拒绝后列表状态变为 rejected', async () => {
    const list = await invokeHandler(listPattern, 'get', listUrl)
    const items = (list.body.data as { items: CorrectionItem[] }).items
    const target = items.find((i) => i.status === 'submitted')!

    await invokeHandler(decidePattern, 'post', `${listUrl}/${target.id}/decide`, { input: { decision: 'reject' } })
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === target.id)
    expect(updated?.status).toBe('rejected')
  })

  it('不存在的纠错返回 404', async () => {
    const out = await invokeHandler(decidePattern, 'post', `${listUrl}/cor-does-not-exist/decide`, { input: { decision: 'approve' } })
    expect(out.statusCode).toBe(404)
  })

  it('撤回真实落库', async () => {
    const list = await invokeHandler(listPattern, 'get', listUrl)
    const items = (list.body.data as { items: CorrectionItem[] }).items
    const target = items.find((i) => i.status === 'submitted')!

    const out = await invokeHandler(withdrawPattern, 'post', `${listUrl}/${target.id}/withdraw`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === target.id)
    expect(updated?.status).toBe('withdrawn')
  })

  it('admin 列表与社团版共享 correctionsDb（org 侧新提交 admin 可见）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=org_admin')
    const create = await invokeHandler('/api/org/:clubId/audit/corrections', 'post', '/api/org/club-001/audit/corrections', { input: { targetType: '成员信息', targetId: 'mem-003', reason: '测试共享内存库', evidence: '' } })
    expect(create.statusCode, JSON.stringify(create.body)).toBe(200)
    const adminList = await invokeHandler(listPattern, 'get', listUrl)
    const items = (adminList.body.data as { items: CorrectionItem[] }).items
    expect(items.some((i) => i.reason === '测试共享内存库')).toBe(true)
  })
})

