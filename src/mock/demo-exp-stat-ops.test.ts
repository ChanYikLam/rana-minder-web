import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetDb, resetOrgDb, resetSharedState } from './reset'
import * as db from './db'
import { rdb } from './recruitment-api'

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

describe('P2-014/015/016 评审整改回归（导出鉴权/触发器收敛/配置持久化/统计口径）', () => {
  beforeEach(() => {
    clearMockSession()
    resetRecruitmentDB()
    resetNotifications()
    resetCorrections()
    resetDb()
    resetOrgDb()
    resetSharedState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('P2-1：admin exports GET 清单越权拦截——非平台管理员 403', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    const out = await invokeHandler('/api/admin/exports', 'get', '/api/admin/exports')
    expect(out.statusCode).toBe(403)
  })

  it('P2-1：admin exports GET 管理员可读全平台任务（含 includeContact 敏感标志）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const out = await invokeHandler('/api/admin/exports', 'get', '/api/admin/exports')
    expect(out.statusCode).toBe(200)
    const items = (out.body.data as { items: { id: string; includeContact: boolean }[] }).items
    expect(items.some((t) => t.id === 'exp-003')).toBe(true)
    expect(items[0].includeContact).toBe(true)
  })

  it('P2-1：admin exports 下载/状态端点同样越权拦截（同族端点口径一致）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    const dl = await invokeHandler('/api/admin/exports/:id/download', 'post', '/api/admin/exports/exp-003/download')
    expect(dl.statusCode).toBe(403)
    const st = await invokeHandler('/api/admin/exports/:id/status', 'get', '/api/admin/exports/exp-003/status')
    expect(st.statusCode).toBe(403)
  })

  it('P2-2：成员级外部变更触发器不再注册 HTTP 路由（演示入口收敛为 db 直调）', () => {
    expect(() =>
      invokeHandler('/api/org/:clubId/members/:memberId/trigger-external-change', 'post', '/api/org/club-001/members/mem-001/trigger-external-change', { input: {} }),
    ).toThrow(/handler 未找到/)
  })

  it('P2-3：admin config POST 落内存库，GET 回读保存值（重进页面不还原）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const saved = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', {
      input: { academicYear: '2027—2028', cohort: '2027级', maxMembers: 800 },
    })
    expect(saved.statusCode).toBe(200)
    const savedData = saved.body.data as { academicYear: string; cohort: string; maxMembers: number; version: number }
    expect(savedData.academicYear).toBe('2027—2028')
    expect(savedData.cohort).toBe('2027级')
    const got = await invokeHandler('/api/admin/config', 'get', '/api/admin/config')
    const gotData = got.body.data as { academicYear: string; cohort: string; maxMembers: number }
    expect(gotData.academicYear).toBe('2027—2028')
    expect(gotData.cohort).toBe('2027级')
    expect(gotData.maxMembers).toBe(800)
  })

  it('P2-3：admin config 越权拦截（platform:config:manage）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=member')
    const got = await invokeHandler('/api/admin/config', 'get', '/api/admin/config')
    expect(got.statusCode).toBe(403)
  })

  it('P2-3：社团域 config 不携带 academicYear/cohort（平台级字段不误提交）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = await invokeHandler('/api/org/:clubId/config', 'get', '/api/org/club-001/config')
    expect(out.statusCode).toBe(200)
    const data = out.body.data as Record<string, unknown>
    expect(data.academicYear).toBeUndefined()
    expect(data.cohort).toBeUndefined()
  })

  it('P3-1：部门负责人统计四指标按本部门范围过滤（本月新增不再写死 0）', async () => {
    db.members.push({
      id: 'mem-stats-1', clubId: 'club-001', studentId: '20990001',
      name: '本月新人', email: 'new@example.edu.cn', phone: '13800000099',
      status: 'active', joinedAt: new Date().toISOString(), exitedAt: null,
      positions: [{ id: 'pos-stats-1', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2026-08-01', endDate: null, status: 'active' }],
      tenures: [], departmentHistory: [], anomalies: [],
    })

    resolveMockUser('/api/auth/session?_mock_user=deptleader')
    const deptOut = await invokeHandler('/api/org/:clubId/stats', 'get', '/api/org/club-001/stats')
    expect(deptOut.statusCode).toBe(200)
    const deptByLabel = Object.fromEntries(
      ((deptOut.body.data as { summary: { label: string; value: number }[] }).summary).map((s) => [s.label, s.value]),
    )
    const techTotal = db.listMembers('club-001').filter(
      (m) => m.status === 'active' && m.positions.find((p) => p.status === 'active')?.departmentName === '技术部',
    ).length
    expect(deptByLabel['总成员数']).toBe(techTotal)
    // 旧实现 scope 存在时本月新增写死 0；现按本部门成员集统计，注入的本月新人可被计数
    expect(deptByLabel['本月新增']).toBe(1)
    // 待处理申请=技术部第一志愿（app-001、app-003），非全社团 5 条
    expect(deptByLabel['待处理申请']).toBe(2)
    // 活跃招新=含技术部的进行中活动（act-001）
    expect(deptByLabel['活跃招新']).toBe(1)

    resolveMockUser('/api/auth/session?_mock_user=leader')
    const clubOut = await invokeHandler('/api/org/:clubId/stats', 'get', '/api/org/club-001/stats')
    const clubByLabel = Object.fromEntries(
      ((clubOut.body.data as { summary: { label: string; value: number }[] }).summary).map((s) => [s.label, s.value]),
    )
    expect(clubByLabel['总成员数']).toBe(db.listMembers('club-001').filter((m) => m.status === 'active').length)
    expect(clubByLabel['本月新增']).toBe(1)
    expect(clubByLabel['待处理申请']).toBe(5)
    expect(clubByLabel['活跃招新']).toBe(rdb.recruitmentActivities.filter((a) => a.clubId === 'club-001' && a.status === 'in_progress').length)
  })

  it('P2-017：admin config 白名单——未知字段/原型键拒绝，类型不符拒绝', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    // 模拟 JSON 报文携带 __proto__ 键（JSON.parse 产生自有属性），白名单必须拒绝并不得污染原型
    const proto = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', JSON.parse('{"input":{"__proto__":{"polluted":1}}}'))
    expect(proto.statusCode).toBe(422)
    expect((proto.body as { message: string }).message).toContain('未知配置字段')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()

    const unknown = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', {
      input: { evil: 1, clubName: 'A' },
    })
    expect(unknown.statusCode).toBe(422)
    expect((unknown.body as { message: string }).message).toContain('未知配置字段')

    const badType = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', {
      input: { maxMembers: 'abc' },
    })
    expect(badType.statusCode).toBe(422)
    expect((badType.body as { message: string }).message).toContain('需为 number 类型')

    const badBool = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', {
      input: { allowSelfExit: 'yes' },
    })
    expect(badBool.statusCode).toBe(422)
    expect((badBool.body as { message: string }).message).toContain('需为 boolean 类型')
  })

  it('P2-017：admin config 白名单——合法字段仍可落库且拒绝后不影响已存值', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { clubName: 'RanaMinder 平台' } })
    const good = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { maxMembers: 600 } })
    expect(good.statusCode).toBe(200)
    expect((good.body.data as { maxMembers: number; clubName: string }).maxMembers).toBe(600)
    expect((good.body.data as { clubName: string }).clubName).toBe('RanaMinder 平台')
  })

  it('P2-017：ops-status 统计前结算任务队列——逾期生成中任务不再计入 pending（exp-002 → failed）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const out = await invokeHandler('/api/admin/ops-status', 'get', '/api/admin/ops-status')
    expect(out.statusCode).toBe(200)
    const queue = (out.body.data as { taskQueue: { pending: number; processing: number; failed: number } }).taskQueue
    expect(queue.pending).toBe(0)
    expect(queue.failed).toBeGreaterThanOrEqual(1)
    // 结算写回共享状态机：社团导出清单中 exp-002 同样呈现失败而非生成中
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const exports = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    const items = (exports.body.data as { items: { id: string; status: string }[] }).items
    expect(items.find((t) => t.id === 'exp-002')?.status).toBe('failed')
  })

  it('P2-017：统计 trend 按周期对比真实计算（不再四项全 flat/0）', async () => {
    db.members.push({
      id: 'mem-stats-2', clubId: 'club-001', studentId: '20990002',
      name: '趋势新人', email: 'trend@example.edu.cn', phone: '13800000088',
      status: 'active', joinedAt: new Date().toISOString(), exitedAt: null,
      positions: [{ id: 'pos-stats-2', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2026-08-01', endDate: null, status: 'active' }],
      tenures: [], departmentHistory: [], anomalies: [],
    })

    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = await invokeHandler('/api/org/:clubId/stats', 'get', '/api/org/club-001/stats')
    const byLabel = Object.fromEntries(
      ((out.body.data as { summary: { label: string; trend: string; trendValue: number }[] }).summary).map((s) => [s.label, s]),
    )
    // 总成员数：本月净增 1 → up/1
    expect(byLabel['总成员数']).toMatchObject({ trend: 'up', trendValue: 1 })
    // 本月新增：本月 1 vs 上月 0 → up/1
    expect(byLabel['本月新增']).toMatchObject({ trend: 'up', trendValue: 1 })
    // 活跃招新：进行中 1（act-001，club-001）vs 近 30 天已结束 0 → up/1
    expect(byLabel['活跃招新']).toMatchObject({ trend: 'up', trendValue: 1 })
    // 待处理申请：当前 5 vs 上期遗留 5（种子均提交逾 30 天）→ flat/0
    expect(byLabel['待处理申请']).toMatchObject({ trend: 'flat', trendValue: 0 })

    resolveMockUser('/api/auth/session?_mock_user=deptleader')
    const deptOut = await invokeHandler('/api/org/:clubId/stats', 'get', '/api/org/club-001/stats')
    const deptByLabel = Object.fromEntries(
      ((deptOut.body.data as { summary: { label: string; trend: string; trendValue: number }[] }).summary).map((s) => [s.label, s]),
    )
    // 部门口径：注入新人本月入社（技术部）→ 总成员数 up/1；进行中 1 vs 已结束 0 → 活跃招新 up/1
    expect(deptByLabel['总成员数']).toMatchObject({ trend: 'up', trendValue: 1 })
    expect(deptByLabel['活跃招新']).toMatchObject({ trend: 'up', trendValue: 1 })
  })

  it('P2-017：总成员数趋势纳入本月退出——上月基数不再等于「当前−本月入社」', async () => {
    db.members.push({
      id: 'mem-stats-exit', clubId: 'club-001', studentId: '20990003',
      name: '本月退出', email: 'exit@example.edu.cn', phone: '13800000077',
      status: 'exited', joinedAt: '2024-01-01T00:00:00+08:00', exitedAt: new Date().toISOString(),
      positions: [{ id: 'pos-exit-1', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-01-01', endDate: new Date().toISOString().slice(0, 10), status: 'ended' }],
      tenures: [], departmentHistory: [], anomalies: [],
    })

    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = await invokeHandler('/api/org/:clubId/stats', 'get', '/api/org/club-001/stats')
    const byLabel = Object.fromEntries(
      ((out.body.data as { summary: { label: string; trend: string; trendValue: number }[] }).summary).map((s) => [s.label, s]),
    )
    // 本月无入社，但成员本月退出 → 上期基线为当前+1 → down/1（旧口径按「当前−本月入社」会误报 flat/0）
    expect(byLabel['总成员数']).toMatchObject({ trend: 'down', trendValue: 1 })
  })

  it('P2-017：maxMembers 数值范围校验——0/负数/小数拒绝，1 与合法整数可通过', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const zero = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { maxMembers: 0 } })
    expect(zero.statusCode).toBe(422)
    expect((zero.body as { message: string }).message).toContain('1 以上整数')

    const negative = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { maxMembers: -5 } })
    expect(negative.statusCode).toBe(422)

    const decimal = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { maxMembers: 12.5 } })
    expect(decimal.statusCode).toBe(422)

    const ok = await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { maxMembers: 12 } })
    expect(ok.statusCode).toBe(200)
    expect((ok.body.data as { maxMembers: number }).maxMembers).toBe(12)
  })

  it('P2-017：导出任务状态机补 processing 中间态——ops-status 的 processing 取自真实状态非恒 0', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))

    resolveMockUser('/api/auth/session?_mock_user=leader')
    const created = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
    expect(created.statusCode).toBe(200)

    // 刚创建（elapsed≈0）：generating（排队等待调度）→ pending 计入
    let list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    let items = (list.body.data as { items: { id: string; status: string }[] }).items
    const createdId = (created.body.data as { id: string }).id
    expect(items.find((t) => t.id === createdId)?.status).toBe('generating')

    // 越过 500ms 起始阈值：进入 processing（生成中）
    vi.advanceTimersByTime(1000)
    list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.find((t) => t.id === createdId)?.status).toBe('processing')

    resolveMockUser('/api/auth/session?_mock_user=admin')
    const out = await invokeHandler('/api/admin/ops-status', 'get', '/api/admin/ops-status')
    const queue = (out.body.data as { taskQueue: { pending: number; processing: number; failed: number } }).taskQueue
    expect(queue.processing).toBeGreaterThanOrEqual(1)

    // 越过 3000ms 阈值：processing → completed
    vi.advanceTimersByTime(3000)
    resolveMockUser('/api/auth/session?_mock_user=leader')
    list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.find((t) => t.id === createdId)?.status).toBe('completed')
  })

  it('P2-015：admin 对账端点触发成员外部变更——成员详情出现数据异常（闭环真实调用方）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const r = await invokeHandler('/api/admin/clubs/:clubId/reconcile', 'post', '/api/admin/clubs/club-001/reconcile')
    expect(r.statusCode).toBe(200)
    const data = r.body.data as { registered: number; checked: number }
    expect(data.checked).toBeGreaterThan(0)
    expect(data.registered).toBe(data.checked)

    const detail = await invokeHandler('/api/org/:clubId/members/:memberId', 'get', '/api/org/club-001/members/mem-001')
    const anomalies = (detail.body.data as { anomalies: { id: string; kind: string }[] }).anomalies
    expect(anomalies.some((a) => a.kind === 'external_change')).toBe(true)
  })

  it('P2-017：resetSharedState 还原导出任务/平台配置/异常序号——处理用例后不再残留', async () => {
    // 制造共享状态污染：触发异常 + 修改平台配置 + 创建新导出任务
    db.triggerMemberExternalChange('club-001', 'mem-001')
    db.triggerMemberExternalChange('club-001', 'mem-001')
    resolveMockUser('/api/auth/session?_mock_user=admin')
    await invokeHandler('/api/admin/config', 'post', '/api/admin/config', { input: { maxMembers: 999 } })
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const created = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
    expect(created.statusCode).toBe(200)

    resetSharedState()

    // 配置还原到种子 maxMembers=500
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const got = await invokeHandler('/api/admin/config', 'get', '/api/admin/config')
    expect((got.body.data as { maxMembers: number }).maxMembers).toBe(500)

    // 导出任务还原为种子集（新建任务被清除）
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const exports = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    const items = (exports.body.data as { items: { id: string }[] }).items
    expect(items.some((t) => t.id === (created.body.data as { id: string }).id)).toBe(false)
    expect(items.map((t) => t.id).sort()).toEqual(['exp-001', 'exp-002'])

    // 异常序号还原：重置后再次触发，id 序号从 0 重新计数
    resolveMockUser('/api/auth/session?_mock_user=admin')
    db.triggerMemberExternalChange('club-001', 'mem-001')
    const detail = await invokeHandler('/api/org/:clubId/members/:memberId', 'get', '/api/org/club-001/members/mem-001')
    const anomalies = (detail.body.data as { anomalies: { id: string }[] }).anomalies
    expect(anomalies[0].id.endsWith('-0')).toBe(true)
  })
})
