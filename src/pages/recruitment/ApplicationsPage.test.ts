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

  it('加载失败后重试恢复：错误态点重试成功渲染列表', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: { items: [app] } })
    const wrapper = mount(ApplicationsPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')

    await wrapper.find('.psb-retry').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('张三')
    wrapper.unmount()
  })

  it('P2-18：快速切 Tab 时乱序返回的旧响应不覆盖列表', async () => {
    let resolveA!: (v: unknown) => void
    let resolveB!: (v: unknown) => void
    mockGet
      .mockResolvedValueOnce({ kind: 'completed', data: { items: [app] } })
      .mockImplementationOnce(() => new Promise((r) => { resolveA = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r }))
    const wrapper = mount(ApplicationsPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 切到"已接受"（请求 A 挂起），再切到"已拒绝"（请求 B 挂起）
    const tabA = wrapper.findAll('button').find((b) => b.text().includes('已接受'))!
    const tabB = wrapper.findAll('button').find((b) => b.text().includes('已拒绝'))!
    await tabA.trigger('click')
    await tabB.trigger('click')
    // B 先返回：展示 B 的结果
    resolveB({ kind: 'completed', data: { items: [{ ...app, status: 'rejected', applicantName: '王五' }] } })
    await flushPromises()
    expect(wrapper.text()).toContain('王五')
    // A 后返回（乱序）：应被丢弃，列表仍是 B 的结果
    resolveA({ kind: 'completed', data: { items: [{ ...app, status: 'accepted', applicantName: '李四' }] } })
    await flushPromises()
    expect(wrapper.text()).toContain('王五')
    expect(wrapper.text()).not.toContain('李四')
    wrapper.unmount()
  })
})
