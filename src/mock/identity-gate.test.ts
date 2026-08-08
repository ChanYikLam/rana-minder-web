import { describe, expect, it, beforeEach } from 'vitest'
import handlers, { resetIdentityMockState } from './index'
import { resolveMockUser, clearMockSession, resetMockUsers, getMockDegraded } from './auth'

/** 走 mock 真实分发路径（与 form-save-conflict.test.ts 同款） */
function invoke(urlPattern: string, method: string, reqUrl: string, body: unknown = {}): {
  code?: number
  data?: { degraded?: boolean; degradedSince?: string | null; profileGate?: { complete: boolean; emailVerified: boolean }; version?: number; workspace?: { clubId: string; memberId?: string } | null }
  statusCode?: number
  body?: { code?: string; message?: string; supportId?: string; currentData?: unknown }
} {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
  const url = new URL(reqUrl, 'http://localhost')
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { query[k] = v })
  return handler.response({ url: url.pathname + url.search, query, body, headers: {} }) as never
}

describe('P1-006 身份域演示身份：资料不完整/邮箱未验证/账号禁用', () => {
  beforeEach(() => {
    clearMockSession()
    resetMockUsers()
    resetIdentityMockState()
  })

  it('incomplete：资料不完整但邮箱已验证', () => {
    const u = resolveMockUser('/api/auth/session?_mock_user=incomplete')
    expect(u.profileComplete).toBe(false)
    expect(u.emailVerified).toBe(true)
  })

  it('unverified：邮箱未验证但资料完整', () => {
    const u = resolveMockUser('/api/auth/session?_mock_user=unverified')
    expect(u.emailVerified).toBe(false)
    expect(u.profileComplete).toBe(true)
  })

  it('disabled：账号禁用标记（会话层拒绝登录）', () => {
    const u = resolveMockUser('/api/auth/session?_mock_user=disabled')
    expect(u.disabled).toBe(true)
  })

  it('session：三类身份的 profileGate 与降级默认值正确', () => {
    const incomplete = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=incomplete')
    expect(incomplete.data?.profileGate).toEqual({ complete: false, emailVerified: true })
    expect(incomplete.data?.degraded).toBe(false)
    expect(incomplete.data?.degradedSince).toBeNull()

    const unverified = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=unverified')
    expect(unverified.data?.profileGate).toEqual({ complete: true, emailVerified: false })

    const normal = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=member')
    expect(normal.data?.profileGate).toEqual({ complete: true, emailVerified: true })
  })

  it('新身份已登记成员映射：currentClubId=club-001 时 workspace.memberId 可解析（P3-1）', () => {
    const incomplete = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=incomplete')
    expect(incomplete.data?.workspace?.clubId).toBe('club-001')
    expect(incomplete.data?.workspace?.memberId).toBe('mem-007')

    const unverified = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=unverified')
    expect(unverified.data?.workspace?.clubId).toBe('club-001')
    expect(unverified.data?.workspace?.memberId).toBe('mem-008')
  })

  it('session：禁用账号返回 403 + IFC-ERR-011，拒绝建立会话', () => {
    const out = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=disabled')
    expect(out.statusCode).toBe(403)
    expect(out.body?.code).toBe('IFC-ERR-011')
    expect(out.body?.message).toContain('禁用')
    expect(out.body?.supportId).toMatch(/^MOCK-/)
  })
})

describe('P1-006 降级模式演示开关（SRS-FAIL-001）', () => {
  beforeEach(() => {
    clearMockSession()
    resetIdentityMockState()
  })

  it('关闭（默认）：session degraded=false 且 degradedSince 为 null', () => {
    const out = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=leader')
    expect(out.data?.degraded).toBe(false)
    expect(out.data?.degradedSince).toBeNull()
  })

  it('开启后：session 输出 degraded=true 与 15 分钟窗口起点（ISO 时间）', () => {
    invoke('/api/mock/degraded', 'post', '/api/mock/degraded', { enabled: true })
    expect(getMockDegraded().enabled).toBe(true)

    const out = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=leader')
    expect(out.data?.degraded).toBe(true)
    expect(out.data?.degradedSince).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const since = new Date(out.data?.degradedSince as string).getTime()
    expect(Date.now() - since).toBeLessThan(60_000)
  })

  it('关闭后：session 恢复 degraded=false（开关可控可回退）', () => {
    invoke('/api/mock/degraded', 'post', '/api/mock/degraded', { enabled: true })
    const off = invoke('/api/mock/degraded', 'post', '/api/mock/degraded', { enabled: false })
    expect(off.data?.degraded).toBe(false)
    expect(off.data?.degradedSince).toBeNull()

    const out = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=leader')
    expect(out.data?.degraded).toBe(false)
  })

  it('GET /api/mock/degraded 可读当前降级状态', () => {
    invoke('/api/mock/degraded', 'post', '/api/mock/degraded', { enabled: true })
    const out = invoke('/api/mock/degraded', 'get', '/api/mock/degraded')
    expect(out.data?.degraded).toBe(true)
    expect(out.data?.degradedSince).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('P1-006 资料保存乐观锁：expectedVersion 与最新版本比对', () => {
  beforeEach(() => {
    clearMockSession()
    resetMockUsers()
    resetIdentityMockState()
  })

  it('首次保存 expectedVersion=1 通过，并返回递增后的 version', () => {
    const out = invoke(
      '/api/auth/profile',
      'put',
      '/api/auth/profile?_mock_user=member',
      { input: { email: 'member2@example.edu.cn', phone: '13800000005' }, expectedVersion: 1 },
    )
    expect(out.code).toBe(0)
    expect(out.data?.version).toBe(2)
  })

  it('空 input:{} 不消耗版本号：连续两次空提交均返回 200，版本保持 1（MRM-007）', () => {
    const first = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: {}, expectedVersion: 1 })
    expect(first.code).toBe(0)
    expect(first.data?.version).toBe(1)
    const second = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: {}, expectedVersion: 1 })
    expect(second.code).toBe(0)
    expect(second.data?.version).toBe(1)
  })

  it('编辑后原样提交不消耗版本号：提交值 === 现值时版本保持不变（MRM-007 边界）', () => {
    const member = invoke('/api/auth/profile', 'get', '/api/auth/profile?_mock_user=member')
    expect(member.data?.version).toBe(1)
    // 原样提交当前 email/phone，无实际差异，不应递增版本
    const same = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', {
      input: { email: 'member@example.edu.cn', phone: '13800000005' },
      expectedVersion: 1,
    })
    expect(same.code).toBe(0)
    expect(same.data?.version).toBe(1)
    const after = invoke('/api/auth/profile', 'get', '/api/auth/profile?_mock_user=member')
    expect(after.data?.version).toBe(1)
    // 真正变更后才递增
    const changed = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', {
      input: { email: 'member@example.edu.cn', phone: '13800000009' },
      expectedVersion: 1,
    })
    expect(changed.code).toBe(0)
    expect(changed.data?.version).toBe(2)
  })

  it('连续两次提交 expectedVersion=1（有实际数据变更）：版本比对通过即登记新版本，第二次起一律 409（P2-2 原子一致）', () => {
    invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'a@example.edu.cn' }, expectedVersion: 1 })
    const stale = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'b@example.edu.cn' }, expectedVersion: 1 })
    expect(stale.statusCode).toBe(409)
    expect(stale.body?.code).toBe('IFC-ERR-008')
    expect(stale.body?.currentData).toBeTruthy()
    // 第三次仍携带旧版本：同样 409，不会因「版本登记滞后于保存生效」被放行
    const stillStale = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'c@example.edu.cn' }, expectedVersion: 1 })
    expect(stillStale.statusCode).toBe(409)
  })

  it('GET /api/auth/profile 返回当前版本号（P2-3：页面乐观锁以响应版本为准，空输入不递增）', () => {
    const first = invoke('/api/auth/profile', 'get', '/api/auth/profile?_mock_user=member')
    expect(first.data?.version).toBe(1)
    // 空输入不消耗版本号
    invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: {}, expectedVersion: 1 })
    const after = invoke('/api/auth/profile', 'get', '/api/auth/profile?_mock_user=member')
    expect(after.data?.version).toBe(1)
    // 有实际数据变更才递增版本
    invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'x@example.edu.cn' }, expectedVersion: 1 })
    const afterSave = invoke('/api/auth/profile', 'get', '/api/auth/profile?_mock_user=member')
    expect(afterSave.data?.version).toBe(2)
  })

  it('带上最新版本可继续保存（版本追上后不再冲突）', () => {
    invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'a@example.edu.cn' }, expectedVersion: 1 })
    invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'a@example.edu.cn' }, expectedVersion: 1 })
    const latest = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'b@example.edu.cn' }, expectedVersion: 2 })
    expect(latest.code).toBe(0)
    expect(latest.data?.version).toBe(3)
  })

  it('不携带 expectedVersion 时不查版本，直接保存', () => {
    const out = invoke('/api/auth/profile', 'put', '/api/auth/profile?_mock_user=member', { input: { email: 'x@example.edu.cn' } })
    expect(out.code).toBe(0)
  })

  it('资料不完整用户保存后：profileComplete 落库，会话资料门翻转（IDN-011 闭环）', () => {
    const before = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=incomplete')
    expect(before.data?.profileGate).toEqual({ complete: false, emailVerified: true })

    // 使用有实际变更的输入（incomplete 默认 phone 为 13800000021，此处改为 13800000022），
    // 原样提交在 MRM-007 边界下不再触发保存，无法用于验证资料门翻转
    const saved = invoke(
      '/api/auth/profile',
      'put',
      '/api/auth/profile?_mock_user=incomplete',
      { input: { email: 'incomplete@example.edu.cn', phone: '13800000022' }, expectedVersion: 1 },
    )
    expect(saved.code).toBe(0)

    const after = invoke('/api/auth/session', 'get', '/api/auth/session')
    expect(after.data?.profileGate).toEqual({ complete: true, emailVerified: true })
  })
})

describe('P1-006 邮箱验证联动：验证码通过后 emailVerified 落库（IDN-011 闭环）', () => {
  beforeEach(() => {
    clearMockSession()
    resetMockUsers()
    resetIdentityMockState()
  })

  it('验证码错误：422 + IFC-ERR-007，不落库', () => {
    const bad = invoke('/api/auth/profile/verify-email', 'post', '/api/auth/profile/verify-email?_mock_user=unverified', {
      input: { code: '000000' },
    })
    expect(bad.statusCode).toBe(422)
    expect(bad.body?.code).toBe('IFC-ERR-007')

    const session = invoke('/api/auth/session', 'get', '/api/auth/session?_mock_user=unverified')
    expect(session.data?.profileGate).toEqual({ complete: true, emailVerified: false })
  })

  it('验证码通过：会话资料门 emailVerified 翻转', () => {
    const ok = invoke('/api/auth/profile/verify-email', 'post', '/api/auth/profile/verify-email?_mock_user=unverified', {
      input: { code: '123456' },
    })
    expect(ok.code).toBe(0)

    const session = invoke('/api/auth/session', 'get', '/api/auth/session')
    expect(session.data?.profileGate).toEqual({ complete: true, emailVerified: true })
  })
})
