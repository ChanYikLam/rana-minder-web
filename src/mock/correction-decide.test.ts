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
    resolveMockUser('/api/auth/session?_mock_user=admin')
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

  it('撤回真实落库（提交者本人可撤回，他人 403）', async () => {
    const created = await invokeHandler(listPattern, 'post', listUrl, {
      input: { targetType: '社团信息', targetId: 'club-001', reason: '撤回测试', evidence: '' },
    })
    expect(created.statusCode, JSON.stringify(created.body)).toBe(200)
    const { id } = created.body.data as { id: string }

    resolveMockUser('/api/auth/session?_mock_user=leader')
    const denied = await invokeHandler(withdrawPattern, 'post', `${listUrl}/${id}/withdraw`)
    expect(denied.statusCode).toBe(403)

    resolveMockUser('/api/auth/session?_mock_user=admin')
    const out = await invokeHandler(withdrawPattern, 'post', `${listUrl}/${id}/withdraw`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === id)
    expect(updated?.status).toBe('withdrawn')
  })

  it('admin 列表与社团版共享 correctionsDb（org 侧新提交 admin 可见）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    expect(resolveMockUser('/api/auth/session').id).toBe('user-leader-001')
    const create = await invokeHandler('/api/org/:clubId/audit/corrections', 'post', '/api/org/club-001/audit/corrections', { input: { targetType: '成员信息', targetId: 'mem-003', reason: '测试共享内存库', evidence: '' } })
    expect(create.statusCode, JSON.stringify(create.body)).toBe(200)
    resolveMockUser('/api/auth/session?_mock_user=admin')
    expect(resolveMockUser('/api/auth/session').id).toBe('user-admin-001')
    const adminList = await invokeHandler(listPattern, 'get', listUrl)
    const items = (adminList.body.data as { items: CorrectionItem[] }).items
    expect(items.some((i) => i.reason === '测试共享内存库')).toBe(true)
  })

  it('admin 端点在无平台审计权限时拒绝（403）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    expect(resolveMockUser('/api/auth/session').id).toBe('user-member-001')
    const list = await invokeHandler(listPattern, 'get', listUrl)
    expect(list.statusCode).toBe(403)
    const out = await invokeHandler(decidePattern, 'post', `${listUrl}/cor-001/decide`, { input: { decision: 'approve' } })
    expect(out.statusCode).toBe(403)
  })

  it('admin 发起纠错 submitterName 取登录用户，不接受前端伪造', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const out = await invokeHandler('/api/admin/audit/corrections', 'post', listUrl, {
      input: { targetType: '社团信息', targetId: 'club-001', reason: '伪造提交人校验', evidence: '', submitterName: '伪造者' },
    })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const created = out.body.data as { id: string; submitterName: string }
    expect(created.submitterName).toBe('平台管理员')
    expect(created.submitterName).not.toBe('伪造者')
  })
})

