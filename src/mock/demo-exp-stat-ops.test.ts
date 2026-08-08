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

async function reauthAs(user: string): Promise<string> {
  const out = await invokeHandler('/api/auth/reauth', 'post', `/api/auth/reauth?_mock_user=${user}`)
  expect(out.statusCode).toBe(200)
  return (out.body.data as { proof: string }).proof
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
      positions: [{ id: 'pos-stats-1', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2026-08-01', endDate: null, plannedEndDate: null, status: 'active' }],
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
      positions: [{ id: 'pos-stats-2', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2026-08-01', endDate: null, plannedEndDate: null, status: 'active' }],
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
      positions: [{ id: 'pos-exit-1', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-01-01', endDate: new Date().toISOString().slice(0, 10), plannedEndDate: null, status: 'ended' }],
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
    const data = r.body.data as { registered: number; checked: number; deduped: number; triggered: { memberId: string; memberName: string; registered: boolean; anomalyId: string | null }[] }
    expect(data.checked).toBeGreaterThan(0)
    expect(data.registered).toBe(data.checked)
    expect(data.deduped).toBe(0)
    // 返回逐成员可观测明细：含成员名与登记出的异常 id
    expect(data.triggered.length).toBe(data.checked)
    expect(data.triggered.every((t) => t.registered && t.anomalyId)).toBe(true)
    expect(data.triggered[0].memberName.length).toBeGreaterThan(0)

    const detail = await invokeHandler('/api/org/:clubId/members/:memberId', 'get', '/api/org/club-001/members/mem-001')
    const anomalies = (detail.body.data as { anomalies: { id: string; kind: string }[] }).anomalies
    expect(anomalies.some((a) => a.kind === 'external_change')).toBe(true)
  })

  it('P2-015：对账幂等——重复对账不重复登记异常（去重窗口内 registered=false）', async () => {
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const first = await invokeHandler('/api/admin/clubs/:clubId/reconcile', 'post', '/api/admin/clubs/club-001/reconcile')
    const firstData = first.body.data as { registered: number; checked: number }
    expect(firstData.registered).toBe(firstData.checked)

    // 第二次对账：同成员同类异常已在窗口内 → 全部幂等跳过
    const second = await invokeHandler('/api/admin/clubs/:clubId/reconcile', 'post', '/api/admin/clubs/club-001/reconcile')
    expect(second.statusCode).toBe(200)
    const secondData = second.body.data as { registered: number; deduped: number; checked: number; triggered: { memberId: string; registered: boolean }[] }
    expect(secondData.registered).toBe(0)
    expect(secondData.deduped).toBe(secondData.checked)
    expect(secondData.triggered.every((t) => !t.registered)).toBe(true)

    // 成员异常数量不再膨胀
    const detail = await invokeHandler('/api/org/:clubId/members/:memberId', 'get', '/api/org/club-001/members/mem-001')
    const anomalies = (detail.body.data as { anomalies: { id: string; kind: string }[] }).anomalies
    expect(anomalies.filter((a) => a.kind === 'external_change')).toHaveLength(1)
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

  it('MRM-009：反复 POST 同 scope+type——进行中任务被复用，数组不膨胀', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))
    resolveMockUser('/api/auth/session?_mock_user=leader')

    const first = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
    expect(first.statusCode).toBe(200)
    const firstId = (first.body.data as { id: string }).id

    // 同类型进行中：复用同一任务（不新建）
    for (let i = 0; i < 5; i++) {
      const dup = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
      expect(dup.statusCode).toBe(200)
      expect((dup.body.data as { id: string }).id).toBe(firstId)
    }

    // 进行中复用不产生新条目
    const list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    const items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.filter((t) => t.id === firstId)).toHaveLength(1)
    expect(items.filter((t) => t.id === firstId)[0].status).toBe('generating')
  })

  it('MRM-009：completed 超保留窗口转 expired，GET 时 GC 清出（数组回落途径）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))
    resolveMockUser('/api/auth/session?_mock_user=leader')

    const created = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
    const taskId = (created.body.data as { id: string }).id

    // 走完状态机：generating → processing → completed（每次 GET 推进一个阶段，elapsed 已越过 3000ms）
    vi.advanceTimersByTime(4000)
    // 首次结算 generating → processing（返回值不需要，结算副作用才是目的）
    await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    let list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    let items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.find((t) => t.id === taskId)?.status).toBe('completed')

    // 越过 24h 失效 + 365 天保留窗口 → expired → GET 触发 GC 清出
    vi.advanceTimersByTime(366 * 24 * 3600 * 1000)
    list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.some((t) => t.id === taskId)).toBe(false)
    // 种子 exp-001 仍在（reset 后 expiredAt 被重设为未来，不会转 expired 也不会被 GC）；
    // exp-002 种子为 generating，首次读取即转 failed，修复 failed GC 后超 7 天被正常清出
    expect(items.map((t) => t.id).sort()).toEqual(['exp-001'])
  })

  it('MRM-009：failed 任务超 7 天被 GC 清出（修复 completedAt 死条件，改用 failedAt 判定）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))
    resolveMockUser('/api/auth/session?_mock_user=leader')

    // 创建任务后直接跳过 24h 失败窗口：generating → failed（failedAt 被记录）
    const created = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
    const taskId = (created.body.data as { id: string }).id
    vi.advanceTimersByTime(25 * 3600 * 1000)
    let list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    let items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.find((t) => t.id === taskId)?.status).toBe('failed')

    // 未满 7 天：failed 仍保留（供审计）
    list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.some((t) => t.id === taskId)).toBe(true)

    // 超 7 天：GET 时 GC 清出（此前依赖 completedAt 恒 null 的死条件，永不清理）
    vi.advanceTimersByTime(8 * 24 * 3600 * 1000)
    list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    items = (list.body.data as { items: { id: string; status: string }[] }).items
    expect(items.some((t) => t.id === taskId)).toBe(false)
  })

  it('MRM-009：下载端点对过期/未完成任务拒绝——completed 超 24h 失效不可下载', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))
    resolveMockUser('/api/auth/session?_mock_user=leader')

    // 创建任务并推进到 completed（expiredAt = 创建时 + 24h）
    const created = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
    const taskId = (created.body.data as { id: string }).id
    vi.advanceTimersByTime(4000)
    await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')

    // 未满 24h：可下载（需 reauthProof）
    const proof = await invokeHandler('/api/auth/reauth', 'post', '/api/auth/reauth?_mock_user=leader')
    const proofToken = (proof.body.data as { proof: string }).proof
    const ok = await invokeHandler('/api/org/:clubId/exports/:id/download', 'post', `/api/org/club-001/exports/${taskId}/download`, {
      input: { reason: '季度归档审计需要', reauthProof: proofToken },
    })
    expect(ok.statusCode, JSON.stringify(ok.body)).toBe(200)

    // 越过 24h 失效窗口（但未到 365d expired 转换）：仍为 completed，但链接已失效 → 拒绝下载
    vi.advanceTimersByTime(25 * 3600 * 1000)
    const expired = await invokeHandler('/api/org/:clubId/exports/:id/download', 'post', `/api/org/club-001/exports/${taskId}/download`, {
      input: { reason: '季度归档审计需要', reauthProof: proofToken },
    })
    expect(expired.statusCode).toBe(422)
    expect((expired.body as { message: string }).message).toContain('已过期')
  })

  it('MRM-009：org 下载端点对不存在/未完成任务同样拒绝', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const proof = await reauthAs('leader')

    // 不存在的任务：404（此前同样能拿到下载地址）
    const notFound = await invokeHandler('/api/org/:clubId/exports/:id/download', 'post', '/api/org/club-001/exports/exp-999/download', {
      input: { reason: '合规备案需要下载', reauthProof: proof },
    })
    expect(notFound.statusCode).toBe(404)

    // 刚创建（generating，进行中）：拒绝下载
    const created = await invokeHandler('/api/org/:clubId/exports', 'post', '/api/org/club-001/exports', { input: { type: '成员名单' } })
    const taskId = (created.body.data as { id: string }).id
    const inflight = await invokeHandler('/api/org/:clubId/exports/:id/download', 'post', `/api/org/club-001/exports/${taskId}/download`, {
      input: { reason: '合规备案需要下载', reauthProof: proof },
    })
    expect(inflight.statusCode).toBe(422)
  })

  it('MRM-009：admin 下载端点对不存在/未完成任务同样拒绝，completed 可下载', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))
    resolveMockUser('/api/auth/session?_mock_user=admin')
    const proof = await reauthAs('admin')

    // 不存在的平台任务：404（此前任意 id 都返回下载地址）
    const notFound = await invokeHandler('/api/admin/exports/:id/download', 'post', '/api/admin/exports/exp-999/download', {
      input: { reason: '合规备案需要下载', reauthProof: proof },
    })
    expect(notFound.statusCode).toBe(404)

    // 新建平台任务（进行中）：拒绝下载
    const created = await invokeHandler('/api/admin/exports', 'post', '/api/admin/exports')
    const taskId = (created.body.data as { id: string }).id
    const inflight = await invokeHandler('/api/admin/exports/:id/download', 'post', `/api/admin/exports/${taskId}/download`, {
      input: { reason: '合规备案需要下载', reauthProof: proof },
    })
    expect(inflight.statusCode).toBe(422)

    // 种子 completed 平台任务（exp-003，reset 后 expiredAt 为未来）：可下载
    const ok = await invokeHandler('/api/admin/exports/:id/download', 'post', '/api/admin/exports/exp-003/download', {
      input: { reason: '合规备案需要下载', reauthProof: proof },
    })
    expect(ok.statusCode).toBe(200)
  })

  it('MRM-009：reset 后种子 completed 任务 expiredAt 重设为未来——不被 settle 误转 expired、不被 GC 清出', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-07T08:00:00+08:00'))
    resolveMockUser('/api/auth/session?_mock_user=leader')

    // reset 前：种子 exp-001 expiredAt 是 2025 年的静态值
    const list = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    const items = (list.body.data as { items: { id: string; expiredAt: string | null; status: string }[] }).items
    const before = items.find((t) => t.id === 'exp-001')
    expect(before?.status).toBe('completed')
    // 若未 reset（2025 年 expiredAt 已超保留窗口），settle 应将其转 expired——这里直接证明 GET 结算语义
    // 但测试默认 beforeEach 已 reset，种子 expiredAt 应为未来：断言不早于当前时间
    expect(new Date(before!.expiredAt!).getTime()).toBeGreaterThanOrEqual(Date.now())

    // 推进超过 365 天：若 expiredAt 是未来 7 天，365 天窗口不会越过 → 仍保留
    vi.advanceTimersByTime(360 * 24 * 3600 * 1000)
    const afterList = await invokeHandler('/api/org/:clubId/exports', 'get', '/api/org/club-001/exports')
    const after = (afterList.body.data as { items: { id: string }[] }).items
    expect(after.some((t) => t.id === 'exp-001')).toBe(true)
  })
})
