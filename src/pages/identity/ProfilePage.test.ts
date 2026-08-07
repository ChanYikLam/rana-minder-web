import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, meta: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import ProfilePage from './ProfilePage.vue'

describe('ProfilePage 个人资料', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染个人资料', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        user: { id: 'u1', studentId: '20210001', name: '陈雨桐', email: 'e@example.edu.cn', phone: '13800000001', avatar: null, emailVerified: true, profileComplete: true },
        profileGate: { complete: true, emailVerified: true },
        fields: [],
        version: 1,
      },
    })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/auth/profile')
    expect(wrapper.text()).toContain('个人资料')
  })

  it('加载失败：不渲染资料字段', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('手机号')
    expect(wrapper.text()).not.toContain('身份信息')
    wrapper.unmount()
  })
})
