import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import AdminFormListPage from './AdminFormListPage.vue'

describe('AdminFormListPage 平台表单列表', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染表单列表', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'f1', title: '报名表', status: 'published', version: 2, scope: 'platform', updatedAt: '2026-08-01T00:00:00Z' }] },
    })
    const wrapper = mount(AdminFormListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('平台表单管理')
    expect(wrapper.text()).toContain('报名表')
    expect(wrapper.text()).toContain('v2')
  })

  it('空列表：展示空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(AdminFormListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无平台表单')
  })

  it('加载失败：不渲染列表', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(AdminFormListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('报名表')
  })

  it('点击卡片跳转设计器', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'f1', title: '报名表', status: 'published', version: 1, scope: 'platform', updatedAt: '2026-08-01T00:00:00Z' }] },
    })
    const wrapper = mount(AdminFormListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.find('.card').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/admin/forms/designer/f1')
  })
})
