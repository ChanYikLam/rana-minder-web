import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import MemberListPage from './MemberListPage.vue'

describe('MemberListPage 成员列表', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染成员与统计', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        items: [{
          id: 'mem-001', name: '陈雨桐', studentId: '20210001', email: 'e@example.edu.cn', phone: '13800000001',
          positions: [{ departmentId: 'dept-1', departmentName: '技术部', title: '干事', status: 'active' }],
          department: '技术部', title: '干事', status: 'active',
        }],
        stats: { total: 6, active: 5, exited: 1 },
        pendingCounts: { applications: 0, resignations: 0, invites: 0 },
      },
    })
    const wrapper = mount(MemberListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members')
    expect(wrapper.text()).toContain('陈雨桐')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(MemberListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('陈雨桐')
  })
})
