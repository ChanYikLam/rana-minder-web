import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPush } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import FormListPage from './FormListPage.vue'

describe('FormListPage 社团表单列表', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：按社团前缀请求并渲染', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'f1', title: '招新表', status: 'draft', version: 1, updatedAt: '2026-08-01T00:00:00Z' }] },
    })
    const wrapper = mount(FormListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/forms')
    expect(wrapper.text()).toContain('招新表')
    expect(wrapper.text()).toContain('v1')
  })

  it('空列表：展示空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(FormListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无表单')
  })

  it('点击卡片跳转社团表单设计器', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'f1', title: '招新表', status: 'draft', version: 1, updatedAt: '2026-08-01T00:00:00Z' }] },
    })
    const wrapper = mount(FormListPage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.find('.card').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/org/club-001/forms/designer/f1')
  })
})
