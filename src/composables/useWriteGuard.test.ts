import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWriteGuard } from './useWriteGuard'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { User } from '@/types/domain'

function seedSession(overrides: { profileComplete?: boolean; emailVerified?: boolean; authenticated?: boolean } = {}) {
  const session = useSessionViewStore()
  if (overrides.authenticated === false) {
    session.user = null
  } else {
    session.user = {
      id: 'u1',
      studentId: '20210001',
      name: '测试用户',
      email: 'u1@example.edu.cn',
      phone: '13800000001',
      avatar: null,
      emailVerified: overrides.emailVerified ?? true,
      profileComplete: overrides.profileComplete ?? true,
    } as User
  }
  session.profileGate = {
    complete: overrides.profileComplete ?? true,
    emailVerified: overrides.emailVerified ?? true,
  }
  return session
}

describe('useWriteGuard 写操作门禁（IDN-010/011）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未登录：禁止写操作并提示先登录', () => {
    seedSession({ authenticated: false })
    const { canWrite, writeDisabledReason } = useWriteGuard()
    expect(canWrite.value).toBe(false)
    expect(writeDisabledReason.value).toBe('请先登录')
  })

  it('资料未补齐：禁止写操作并提示补充资料', () => {
    seedSession({ profileComplete: false })
    const { canWrite, writeDisabledReason } = useWriteGuard()
    expect(canWrite.value).toBe(false)
    expect(writeDisabledReason.value).toBe('请先补充个人资料')
  })

  it('邮箱未验证：禁止写操作并提示验证邮箱', () => {
    seedSession({ emailVerified: false })
    const { canWrite, writeDisabledReason } = useWriteGuard()
    expect(canWrite.value).toBe(false)
    expect(writeDisabledReason.value).toBe('请先验证邮箱')
  })

  it('资料完整且已登录：放行写操作', () => {
    seedSession()
    const { canWrite, writeDisabledReason } = useWriteGuard()
    expect(canWrite.value).toBe(true)
    expect(writeDisabledReason.value).toBe('')
  })

  it('响应性：资料补齐后 canWrite 由 false 变 true', async () => {
    seedSession({ profileComplete: false })
    const { canWrite, writeDisabledReason } = useWriteGuard()
    expect(canWrite.value).toBe(false)

    const session = useSessionViewStore()
    session.profileGate = { complete: true, emailVerified: true }
    await vi.waitFor(() => {
      expect(canWrite.value).toBe(true)
      expect(writeDisabledReason.value).toBe('')
    })
  })
})
