import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/org/club-001/forms/versions/form-1', params: { clubId: 'club-001', formId: 'form-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import FormVersionPage from './FormVersionPage.vue'

describe('FormVersionPage 表单版本', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染最新版本表单', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        id: 'form-1', title: '招新报名表',
        versions: [{ version: 2, status: 'published', publishedAt: '2026-08-01T00:00:00Z', fields: [{ id: 'f1', type: 'text', label: '姓名', required: true, readonly: false, permission: 'read_write', options: null, description: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null }] }],
      },
    })
    const wrapper = mount(FormVersionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/forms/form-1')
    expect(wrapper.text()).toContain('招新报名表')
    expect(wrapper.text()).toContain('姓名')
  })

  it('加载失败：不渲染表单', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(FormVersionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('招新报名表')
  })
})
