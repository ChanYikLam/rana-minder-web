import { describe, expect, it, beforeEach } from 'vitest'
import handlers from './index'
import { resolveMockUser, clearMockSession } from './auth'
import { resolveMemberId } from './db'

/** 直接走真实分发路径：mergePathParams 已把路径参数并入 query，response 即处理器签名 */
function invoke(urlPattern: string, method: string, reqUrl: string): { code: number; data?: unknown; statusCode?: number } | null {
  const handler = handlers.find((h) => h.url === urlPattern && h.method === method)
  if (!handler) throw new Error(`handler 未找到: ${method} ${urlPattern}`)
  const url = new URL(reqUrl, 'http://localhost')
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { query[k] = v })
  return handler.response({ url: url.pathname + url.search, query, body: {}, headers: {} }) as { code: number; data?: unknown; statusCode?: number }
}

/** 多社团 leader（club-001 负责人 + club-002 人事）跨社团切换时 memberId 按「用户 × 社团」独立解析 */
describe('多社团切换：memberId 按「用户 × 社团」解析（自审身份不跨社团串用）', () => {
  beforeEach(() => {
    clearMockSession()
  })

  it('/me/clubs 返回 leader 的两个社团', () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = invoke('/api/me/clubs', 'get', '/api/me/clubs')
    const clubs = (out as { data: { clubs: { clubId: string }[] } }).data.clubs
    expect(clubs.map((c) => c.clubId)).toEqual(['club-001', 'club-002'])
  })

  it('/org/club-001/context 返回 club-001 的 memberId（mem-004）', () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = invoke('/api/org/:clubId/context', 'get', '/api/org/club-001/context')
    expect((out as { data: { memberId: string } }).data.memberId).toBe('mem-004')
  })

  it('/org/club-002/context 返回 club-002 的 memberId（mem-101），与 club-001 不同', () => {
    resolveMockUser('/api/auth/session?_mock_user=leader')
    const out = invoke('/api/org/:clubId/context', 'get', '/api/org/club-002/context')
    expect((out as { data: { memberId: string } }).data.memberId).toBe('mem-101')
  })

  it('resolveMemberId 单源解析：同一用户在不同社团成员 id 不同', () => {
    expect(resolveMemberId('user-leader-001', 'club-001')).toBe('mem-004')
    expect(resolveMemberId('user-leader-001', 'club-002')).toBe('mem-101')
    // 无成员身份的社团显式返回 null（不得回退到用户维度的单一值）
    expect(resolveMemberId('user-member-001', 'club-002')).toBeNull()
  })
})
