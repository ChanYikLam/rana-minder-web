import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import MemberExitPage from './MemberExitPage.vue'

const exitData = {
  items: [{ id: 'mem-001', name: '陈雨桐', departmentName: '技术部', title: '干事', status: 'active' }],
  resignations: [{ id: 'res-1', memberName: '王浩然', departmentName: '技术部', title: '副部长', reason: '学业', status: 'under_review' }],
}

describe('MemberExitPage 成员退出与移除', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染成员与辞职申请', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: exitData })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/exit')
    expect(wrapper.text()).toContain('陈雨桐')
    expect(wrapper.text()).toContain('王浩然')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(MemberExitPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('陈雨桐')
  })
})
