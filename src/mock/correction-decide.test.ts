import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetAuditLogs } from './reset'
import { listNotifications } from './notifications'

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
const adminAuditLogsUrl = '/api/admin/audit/logs'
const adminAuditLogsPattern = '/api/admin/audit/logs'
const meCorrectionsUrl = '/api/me/corrections'
const meWithdrawPattern = '/api/me/corrections/:correctionId/withdraw'

interface CorrectionItem { id: string; status: string; reason: string; submitterName: string; decidedBy?: string; decidedAt?: string; withdrawnBy?: string; withdrawnAt?: string; auditTrail?: Array<{ action: string; actorName: string; at: string }> }

/** 回归：管理员纠错处置点击批准/拒绝后列表状态无变化（bug：admin 版 handler 不落库、列表硬编码） */
describe('管理员事实纠错处置（decide 真实落库）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetAuditLogs()
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
    // P1-010 审计闭环：审批人/审批时间落库
    expect(updated?.decidedBy).toBe('平台管理员')
    expect(updated?.decidedAt).toBeTruthy()
    expect(updated?.auditTrail?.some((e) => e.action === 'approve' && e.actorName === '平台管理员')).toBe(true)
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

  it('拒绝写入审计轨迹（reject 条目 + decidedBy/decidedAt）', async () => {
    const list = await invokeHandler(listPattern, 'get', listUrl)
    const items = (list.body.data as { items: CorrectionItem[] }).items
    const target = items.find((i) => i.status === 'submitted')!

    await invokeHandler(decidePattern, 'post', `${listUrl}/${target.id}/decide`, { input: { decision: 'reject' } })
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === target.id)
    expect(updated?.status).toBe('rejected')
    expect(updated?.decidedBy).toBe('平台管理员')
    expect(updated?.decidedAt).toBeTruthy()
    expect(updated?.auditTrail?.some((e) => e.action === 'reject')).toBe(true)
  })

  it('撤回写入审计轨迹（withdraw 条目 + withdrawnBy/withdrawnAt）', async () => {
    const created = await invokeHandler(listPattern, 'post', listUrl, {
      input: { targetType: '社团信息', targetId: 'club-001', reason: '撤回审计测试', evidence: '' },
    })
    const { id } = created.body.data as { id: string }
    await invokeHandler(withdrawPattern, 'post', `${listUrl}/${id}/withdraw`)
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === id)
    expect(updated?.status).toBe('withdrawn')
    expect(updated?.withdrawnBy).toBe('平台管理员')
    expect(updated?.withdrawnAt).toBeTruthy()
    expect(updated?.auditTrail?.some((e) => e.action === 'withdraw' && e.actorName === '平台管理员')).toBe(true)
  })

  it('纠错动作写入审计日志库，审计查询接口可见（闭环）', async () => {
    // 处置一笔纠错
    const list = await invokeHandler(listPattern, 'get', listUrl)
    const target = (list.body.data as { items: CorrectionItem[] }).items.find((i) => i.status === 'submitted')!
    await invokeHandler(decidePattern, 'post', `${listUrl}/${target.id}/decide`, { input: { decision: 'approve' } })

    const logs = await invokeHandler(adminAuditLogsPattern, 'get', adminAuditLogsUrl)
    expect(logs.statusCode).toBe(200)
    const items = (logs.body.data as { items: Array<{ action: string; actorName: string }> }).items
    const hit = items.find((l) => l.action === '批准事实纠错' && l.actorName === '平台管理员')
    expect(hit, '审计日志应包含本次批准动作').toBeTruthy()
  })

  it('admin 域写 platform 审计、org 域写 org 审计（作用域隔离）', async () => {
    // admin 域动作 → platform 审计
    const list = await invokeHandler(listPattern, 'get', listUrl)
    const target = (list.body.data as { items: CorrectionItem[] }).items.find((i) => i.status === 'submitted')!
    await invokeHandler(decidePattern, 'post', `${listUrl}/${target.id}/decide`, { input: { decision: 'approve' } })

    // org 域动作 → org 审计（leader 具 club:audit:view）
    resolveMockUser('/api/auth/session?_mock_user=leader')
    await invokeHandler('/api/org/:clubId/audit/corrections', 'post', '/api/org/club-001/audit/corrections', {
      input: { targetType: '成员信息', targetId: 'mem-009', reason: '作用域隔离测试', evidence: '' },
    })

    resolveMockUser('/api/auth/session?_mock_user=admin')
    const adminLogs = await invokeHandler(adminAuditLogsPattern, 'get', adminAuditLogsUrl)
    const adminItems = (adminLogs.body.data as { items: Array<{ action: string; detail?: string }> }).items
    expect(adminItems.some((l) => l.action === '批准事实纠错')).toBe(true)
    expect(adminItems.some((l) => l.detail?.includes?.('作用域隔离测试')), 'org 域提交不应进入 platform 审计').toBe(false)

    resolveMockUser('/api/auth/session?_mock_user=leader')
    const orgLogs = await invokeHandler('/api/org/:clubId/audit/logs', 'get', '/api/org/club-001/audit/logs')
    const orgItems = (orgLogs.body.data as { items: Array<{ action: string; detail?: string }> }).items
    expect(orgItems.some((l) => l.action === '提交事实纠错' && l.detail?.includes?.('作用域隔离测试'))).toBe(true)
  })

  it('已处置纠错再次处置返回 409（SM-AUD-001：approved 不可再批准/拒绝）', async () => {
    const list = await invokeHandler(listPattern, 'get', listUrl)
    const target = (list.body.data as { items: CorrectionItem[] }).items.find((i) => i.status === 'submitted')!
    await invokeHandler(decidePattern, 'post', `${listUrl}/${target.id}/decide`, { input: { decision: 'approve' } })

    const again = await invokeHandler(decidePattern, 'post', `${listUrl}/${target.id}/decide`, { input: { decision: 'reject' } })
    expect(again.statusCode).toBe(409)
    expect((again.body as { code?: string }).code).toBe('IFC-ERR-007')
    // 状态与审计轨迹未被二次流转污染
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === target.id)
    expect(updated?.status).toBe('approved')
    expect(updated?.auditTrail?.filter((e) => e.action === 'approve' || e.action === 'reject')).toHaveLength(1)
  })

  it('已处置纠错不可重复撤回（withdraw 409，auditTrail 不追加）', async () => {
    const created = await invokeHandler(listPattern, 'post', listUrl, {
      input: { targetType: '社团信息', targetId: 'club-001', reason: '重复撤回测试', evidence: '' },
    })
    const { id } = created.body.data as { id: string }
    await invokeHandler(withdrawPattern, 'post', `${listUrl}/${id}/withdraw`)

    const again = await invokeHandler(withdrawPattern, 'post', `${listUrl}/${id}/withdraw`)
    expect(again.statusCode).toBe(409)
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === id)
    expect(updated?.status).toBe('withdrawn')
    expect(updated?.auditTrail?.filter((e) => e.action === 'withdraw')).toHaveLength(1)
  })

  it('overdue 种子在列表中直接可见（P2-1：SM-AUD-001 deadline 产生路径）', async () => {
    const list = await invokeHandler(listPattern, 'get', listUrl)
    expect(list.statusCode).toBe(200)
    const items = (list.body.data as { items: CorrectionItem[] }).items
    const overdue = items.find((i) => i.id === 'cor-005')
    expect(overdue, '种子应含 overdue 纠错').toBeTruthy()
    expect(overdue?.status).toBe('overdue')
  })

  it('overdue 纠错可被批准处置（SM-AUD-001：overdue -> approve）', async () => {
    const out = await invokeHandler(decidePattern, 'post', `${listUrl}/cor-005/decide`, { input: { decision: 'approve' } })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect((out.body.data as { status: string }).status).toBe('approved')
    const after = await invokeHandler(listPattern, 'get', listUrl)
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === 'cor-005')
    expect(updated?.status).toBe('approved')
  })

  it('overdue 纠错可被提交人本人撤回（SM-AUD-001：overdue -> withdraw）', async () => {
    // cor-005 提交人为赵雨萌（incomplete 用户），经个人中心端点本人撤回
    resolveMockUser('/api/auth/session?_mock_user=incomplete')
    const out = await invokeHandler(meWithdrawPattern, 'post', `${meCorrectionsUrl}/cor-005/withdraw`)
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    expect((out.body.data as { status: string }).status).toBe('withdrawn')
  })

  it('US-AUD-01 自批校验：不能批准自己提交的纠错（422）', async () => {
    // admin 发起一笔纠错（submitterName=平台管理员），随后 admin 尝试批准 → 应拒绝
    const created = await invokeHandler(listPattern, 'post', listUrl, {
      input: { targetType: '社团信息', targetId: 'club-001', reason: '自批校验测试', evidence: '' },
    })
    expect(created.statusCode, JSON.stringify(created.body)).toBe(200)
    const { id } = created.body.data as { id: string }
    const out = await invokeHandler(decidePattern, 'post', `${listUrl}/${id}/decide`, { input: { decision: 'approve' } })
    expect(out.statusCode).toBe(422)
    expect((out.body as { code?: string }).code).toBe('IFC-ERR-006')
  })

  it('US-AUD-01 通知联动：批准后提交人收到纠错通知', async () => {
    // cor-001 提交人为王浩然（interviewer）；admin 批准后王浩然应收到通知
    const out = await invokeHandler(decidePattern, 'post', `${listUrl}/cor-001/decide`, { input: { decision: 'approve' } })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const notifs = listNotifications('user-interviewer-001', false)
    const hit = notifs.find((n) => n.type === 'correction' && n.body.includes('app-003') && n.body.includes('批准'))
    expect(hit, '提交人应收到处置通知').toBeTruthy()
  })

  it('审批不改变 overdue 种子的底层落库状态（列表派生，处置守卫用派生态）', async () => {
    // 通过 org 域（leader）对 overdue 种子批准：底层 submitted 记录按派生 overdue 放行
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = await invokeHandler('/api/org/:clubId/audit/corrections/:correctionId/decide', 'post', '/api/org/club-001/audit/corrections/cor-005/decide', { input: { decision: 'approve' } })
    expect(out.statusCode, JSON.stringify(out.body)).toBe(200)
    const after = await invokeHandler('/api/org/:clubId/audit/corrections', 'get', '/api/org/club-001/audit/corrections')
    const updated = (after.body.data as { items: CorrectionItem[] }).items.find((i) => i.id === 'cor-005')
    expect(updated?.status).toBe('approved')
  })
})

