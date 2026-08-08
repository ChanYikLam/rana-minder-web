import { describe, expect, it } from 'vitest'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { resolveApiScope } from './route-scope'

function fakeRoute(path: string, params: Record<string, unknown> = {}): RouteLocationNormalizedLoaded {
  return { path, params } as RouteLocationNormalizedLoaded
}

describe('resolveApiScope 请求作用域解析', () => {
  it('/admin 前缀 → platform', () => {
    expect(resolveApiScope(fakeRoute('/admin/clubs'))).toEqual({ kind: 'platform', prefix: '/admin' })
  })

  it('/admin 精确路径（无子段）→ null', () => {
    expect(resolveApiScope(fakeRoute('/admin'))).toBeNull()
  })

  it('/me 前缀 → personal', () => {
    expect(resolveApiScope(fakeRoute('/me/ongoing'))).toEqual({ kind: 'personal', prefix: '/me' })
  })

  it('/me 精确路径（无子段）→ null', () => {
    expect(resolveApiScope(fakeRoute('/me'))).toBeNull()
  })

  it('/org/:clubId 带字符串 clubId → workspace', () => {
    expect(resolveApiScope(fakeRoute('/org/club-001/dashboard', { clubId: 'club-001' }))).toEqual({
      kind: 'workspace',
      prefix: '/org/club-001',
      clubId: 'club-001',
    })
  })

  it('/org/:clubId 但 params.clubId 非字符串 → null（防御非法参数）', () => {
    expect(resolveApiScope(fakeRoute('/org/club-001/dashboard', { clubId: ['a', 'b'] }))).toBeNull()
  })

  it('/org/:clubId 缺 params → null', () => {
    expect(resolveApiScope(fakeRoute('/org/club-001/dashboard'))).toBeNull()
  })

  it('未知路径 → null', () => {
    expect(resolveApiScope(fakeRoute('/unknown/page'))).toBeNull()
  })
})
