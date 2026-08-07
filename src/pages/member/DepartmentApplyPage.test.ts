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

import DepartmentApplyPage from './DepartmentApplyPage.vue'

describe('DepartmentApplyPage 部门关系申请', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染申请与部门', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        items: [{ id: 'dap-1', applicantName: '陈雨桐', type: 'transfer', status: 'under_review', targetDeptName: '运营部', reason: '想转岗' }],
        departments: [{ id: 'dept-1', name: '技术部' }],
      },
    })
    const wrapper = mount(DepartmentApplyPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/members/department-apply')
    expect(wrapper.text()).toContain('陈雨桐')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(DepartmentApplyPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('陈雨桐')
  })
})
