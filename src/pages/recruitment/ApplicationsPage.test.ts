import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', activityId: 'act-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import ApplicationsPage from './ApplicationsPage.vue'

const app = {
  id: 'app-1', activityId: 'act-1', applicantId: 'u1', applicantName: '张三', applicantStudentId: '20240001',
  status: 'submitted', preferences: [{ order: 1, departmentId: 'dept-1', departmentName: '技术部' }],
  submittedAt: '2026-08-01T04:00:00Z', withdrawnAt: null, formVersion: 1,
  adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null,
}

describe('ApplicationsPage 报名申请管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染申请列表', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [app] } })
    const wrapper = mount(ApplicationsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/recruitment/act-1/applications')
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('技术部')
  })

  it('空列表：展示空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(ApplicationsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无')
  })

  it('状态筛选：点击标签后带 status 参数重新请求', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [app] } })
    const wrapper = mount(ApplicationsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    const tab = wrapper.findAll('button').find((b) => b.text().includes('已接受'))
    expect(tab, '状态标签应渲染').toBeTruthy()
    await tab!.trigger('click')
    await flushPromises()
    expect(mockGet).toHaveBeenLastCalledWith('/org/club-001/recruitment/act-1/applications?status=accepted')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ApplicationsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })
})
