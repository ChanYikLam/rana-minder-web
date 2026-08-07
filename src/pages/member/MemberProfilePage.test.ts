import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', memberId: 'mem-001' } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import MemberProfilePage from './MemberProfilePage.vue'

const detail = {
  id: 'mem-001', studentId: '20210005', name: '陈雨桐', email: 'm@example.edu.cn', phone: '13800000005',
  status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
  positions: [{ id: 'pos-1', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, status: 'active' }],
  tenures: [{ id: 'ten-1', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, endReason: null }],
  departmentHistory: [{ id: 'dh-1', action: 'join', departmentName: '技术部', at: '2024-09-01T10:00:00+08:00' }],
  anomalies: [],
}

describe('MemberProfilePage 成员档案', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染成员信息与职位', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(MemberProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/mem-001')
    expect(wrapper.text()).toContain('陈雨桐')
    expect(wrapper.text()).toContain('技术部')
    expect(wrapper.text()).toContain('加入')
  })

  it('成员不存在：进入空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: null })
    const wrapper = mount(MemberProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('陈雨桐')
  })

  it('加载失败：不渲染成员信息', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-015', message: '不存在' } })
    const wrapper = mount(MemberProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('陈雨桐')
  })
})
