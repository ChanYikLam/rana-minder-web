/** services/modules 契约测试：通过真实 schema 校验验证前后端契约，
 * 非法 payload 必须被 getValidated 拒绝，防止契约漂移。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { identityApi, organizationApi } from './index'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function stubEnv() {
  vi.stubGlobal('window', { location: { origin: 'https://app.test' } })
  vi.stubGlobal('fetch', mockFetch)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

const validSession = {
  user: {
    id: 'u1', studentId: '20210001', name: '张明远', email: 'l@example.edu.cn',
    phone: '13800000002', avatar: null, emailVerified: true, profileComplete: true,
  },
  profileGate: { complete: true, emailVerified: true },
  degraded: false,
  permissions: ['club:dashboard:view'],
  workspace: null,
}

describe('identityApi.getSession 会话契约', () => {
  it('合法会话 payload 通过 schema 校验', async () => {
    stubEnv()
    mockFetch.mockResolvedValue(jsonResponse({ code: 0, data: validSession }))

    const result = await identityApi.getSession({ mockUser: 'club_leader' })

    expect(result.kind).toBe('completed')
  })

  it('非法 email 被 schema 拒绝', async () => {
    stubEnv()
    mockFetch.mockResolvedValue(jsonResponse({ code: 0, data: { ...validSession, user: { ...validSession.user, email: 'not-an-email' } } }))

    const result = await identityApi.getSession()

    expect(result).toMatchObject({ kind: 'rejected', error: { code: 'IFC-ERR-016' } })
  })

  it('非法角色（workspace.role 不在枚举）被拒绝', async () => {
    stubEnv()
    mockFetch.mockResolvedValue(jsonResponse({
      code: 0,
      data: { ...validSession, workspace: { clubId: 'c1', clubName: 'x', role: 'superuser', permissions: [] } },
    }))

    const result = await identityApi.getSession()

    expect(result.kind).toBe('rejected')
  })

  it('缺字段（user.name 缺失）被拒绝', async () => {
    stubEnv()
    const { name: _name, ...rest } = validSession.user as { name: string } & Record<string, unknown>
    void _name
    mockFetch.mockResolvedValue(jsonResponse({ code: 0, data: { ...validSession, user: rest } }))

    const result = await identityApi.getSession()

    expect(result.kind).toBe('rejected')
  })
})

describe('organizationApi.getContext 工作空间契约', () => {
  const validContext = {
    clubId: 'club-001', clubName: '计算机协会', role: 'club_leader',
    permissions: ['club:dashboard:view'], memberId: 'mem-004',
  }

  it('合法上下文通过校验', async () => {
    stubEnv()
    mockFetch.mockResolvedValue(jsonResponse({ code: 0, data: validContext }))

    const result = await organizationApi.getContext('club-001')

    expect(result.kind).toBe('completed')
  })

  it('clubId 为空被拒绝', async () => {
    stubEnv()
    mockFetch.mockResolvedValue(jsonResponse({ code: 0, data: { ...validContext, clubId: '' } }))

    const result = await organizationApi.getContext('club-001')

    expect(result.kind).toBe('rejected')
  })

  it('memberId 可为 null（无成员身份）', async () => {
    stubEnv()
    mockFetch.mockResolvedValue(jsonResponse({ code: 0, data: { ...validContext, memberId: null } }))

    const result = await organizationApi.getContext('club-001')

    expect(result.kind).toBe('completed')
  })
})
