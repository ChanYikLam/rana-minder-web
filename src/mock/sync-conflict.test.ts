import { describe, expect, it, beforeEach } from 'vitest'
import handlers, { resetIdentityMockState } from './index'
import { resolveMockUser, clearMockSession, resetMockUsers, mockUsers } from './auth'

/** 走 mock 真实分发路径 */
function invoke(urlPattern: string, method: string, reqUrl: string, body: unknown = {}): {
  code?: number
  data?: { conflicts?: Array<{ field: string; label: string; localValue: string; remoteValue: string }>; name?: string; studentId?: string; email?: string; phone?: string }
  statusCode?: number
  body?: { code?: string; message?: string; supportId?: string }
} {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
  const url = new URL(reqUrl, 'http://localhost')
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { query[k] = v })
  return handler.response({ url: url.pathname + url.search, query, body, headers: {} }) as never
}

describe('P0-3 同步冲突（sync-conflict）：真实冲突清单与写回', () => {
  beforeEach(() => {
    clearMockSession()
    resetMockUsers()
    resetIdentityMockState()
  })

  it('冲突清单：本地与学校侧不一致的字段进入冲突列表（leader 姓名冲突）', () => {
    // leader 学校侧姓名登记为「张铭远」，本地为「张明远」→ name 冲突；其余字段一致
    const out = invoke('/api/auth/profile/sync-conflicts', 'get', '/api/auth/profile/sync-conflicts?_mock_user=leader')
    expect(out.code).toBe(0)
    const fields = out.data?.conflicts?.map((c) => c.field)
    expect(fields).toContain('name')
    expect(fields).not.toContain('studentId')
    expect(fields).not.toContain('email')
    expect(fields).not.toContain('phone')
    const nameConflict = out.data?.conflicts?.find((c) => c.field === 'name')
    expect(nameConflict?.localValue).toBe('张明远')
    expect(nameConflict?.remoteValue).toBe('张铭远')
    // 不再出现「（学校侧已更新）」垃圾字符串
    expect(nameConflict?.remoteValue).not.toContain('学校侧已更新')
  })

  it('冲突清单：学校侧与本地一致时不产生冲突（member 无冲突）', () => {
    const out = invoke('/api/auth/profile/sync-conflicts', 'get', '/api/auth/profile/sync-conflicts?_mock_user=member')
    expect(out.code).toBe(0)
    expect(out.data?.conflicts ?? []).toHaveLength(0)
  })

  it('解决冲突：选择学校侧值时真正写回本地档案', () => {
    resolveMockUser('/api/auth/profile/sync-conflicts?_mock_user=leader')
    const out = invoke('/api/auth/profile/sync-conflict', 'post', '/api/auth/profile/sync-conflict', {
      input: { field: 'name', chosenValue: '张铭远' },
    })
    expect(out.code).toBe(0)
    expect(out.data?.name).toBe('张铭远')
    // 本地档案已更新
    const user = mockUsers.leader
    expect(user.name).toBe('张铭远')
  })

  it('解决冲突：不支持的字段返回 422 + IFC-ERR-006', () => {
    const out = invoke('/api/auth/profile/sync-conflict', 'post', '/api/auth/profile/sync-conflict', {
      input: { field: 'avatar', chosenValue: 'x' },
    })
    expect(out.statusCode).toBe(422)
    expect(out.body?.code).toBe('IFC-ERR-006')
  })

  it('解决冲突：空值/未变化提交不产生写回（避免垃圾数据）', () => {
    resolveMockUser('/api/auth/profile?_mock_user=leader')
    const empty = invoke('/api/auth/profile/sync-conflict', 'post', '/api/auth/profile/sync-conflict', {
      input: { field: 'name', chosenValue: '' },
    })
    expect(empty.code).toBe(0)
    expect(mockUsers.leader.name).toBe('张明远')

    const same = invoke('/api/auth/profile/sync-conflict', 'post', '/api/auth/profile/sync-conflict', {
      input: { field: 'name', chosenValue: '张明远' },
    })
    expect(same.code).toBe(0)
    expect(mockUsers.leader.name).toBe('张明远')
  })
})
