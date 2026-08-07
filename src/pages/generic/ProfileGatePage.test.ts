import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionViewStore } from '@/state/sessionViewStore'
import ProfileGatePage from './ProfileGatePage.vue'

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/services/auth', () => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}))

import { getSession } from '@/services/auth'

describe('ProfileGatePage 资料门禁页', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('资料不完整：展示缺失项清单', () => {
    const session = useSessionViewStore()
    session.profileGate = { complete: false, emailVerified: false }
    const wrapper = mount(ProfileGatePage)
    expect(wrapper.text()).toContain('补充个人资料')
    expect(wrapper.text()).toContain('验证邮箱')
  })

  it('仅邮箱未验证：只展示邮箱项', () => {
    const session = useSessionViewStore()
    session.profileGate = { complete: true, emailVerified: false }
    const wrapper = mount(ProfileGatePage)
    expect(wrapper.text()).toContain('验证邮箱')
    expect(wrapper.text()).not.toContain('补充个人资料')
  })

  it('重新检测通过后跳转个人中心', async () => {
    const session = useSessionViewStore()
    session.profileGate = { complete: false, emailVerified: false }
    // 会话刷新后资料已补齐
    vi.mocked(getSession).mockResolvedValue({
      kind: 'completed',
      data: {
        user: { id: 'u1' } as never,
        profileGate: { complete: true, emailVerified: true },
        degraded: false,
        permissions: [],
        workspace: null,
      },
    })
    const wrapper = mount(ProfileGatePage)
    await wrapper.findAll('button').find((b) => b.text().includes('重新核验'))!.trigger('click')
    await flushPromises()
    expect(mockPush).toHaveBeenCalledWith('/me')
  })
})
