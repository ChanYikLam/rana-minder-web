import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resetRecruitmentDB, resetNotifications, resetCorrections, resetDb, resetOrgDb } from './reset'
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
})
