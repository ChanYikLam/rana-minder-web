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

const formVersions = [{ version: 2, status: 'published', publishedAt: '2026-08-01T00:00:00Z', fields: [{ id: 'f1', type: 'text', label: '姓名', required: true, readonly: false, permission: 'read_write', options: null, description: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null }] }]

function setupFormLoad() {
  mockGet.mockImplementation((path: string) => {
    if (path === '/org/club-001/forms/form-1') {
      return Promise.resolve({ kind: 'completed', data: { id: 'form-1', title: '招新报名表', versions: formVersions } })
    }
    // my-draft 默认无记录
    return Promise.resolve({ kind: 'completed', data: null })
  })
}

describe('FormVersionPage 表单版本', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染最新版本表单', async () => {
    setupFormLoad()
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

  it('P0-1 保存草稿：提交用户填写的 formData（非表单定义 fields），不新建版本', async () => {
    setupFormLoad()
    mockPost.mockResolvedValue({ kind: 'completed', data: { status: 'draft', savedAt: '2026-08-08T00:00:00Z' } })
    const wrapper = mount(FormVersionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 填写表单
    const input = wrapper.find('input[type="text"]')
    await input.setValue('张三')
    // 点击保存草稿
    await wrapper.find('button').trigger('click')
    await flushPromises()

    const [path, body] = mockPost.mock.calls[0]
    expect(path).toBe('/org/club-001/forms/versions/form-1/draft')
    expect((body as { formData: unknown }).formData).toEqual({ f1: '张三' })
    expect((body as { version: number }).version).toBe(2)
    expect((body as { idempotencyKey: string }).idempotencyKey).toBeTruthy()
  })

  it('P2-1 草稿恢复：加载页面时读取 my-draft 并回填已填内容', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/org/club-001/forms/form-1') {
        return Promise.resolve({ kind: 'completed', data: { id: 'form-1', title: '招新报名表', versions: formVersions } })
      }
      return Promise.resolve({ kind: 'completed', data: { id: 'sub-1', version: 2, status: 'draft', data: { f1: '已填草稿' }, submittedAt: '2026-08-08T00:00:00Z' } })
    })
    const wrapper = mount(FormVersionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/org/club-001/forms/versions/form-1/my-draft', { version: 2 })
    const input = wrapper.find('input[type="text"]').element as HTMLInputElement
    expect(input.value).toBe('已填草稿')
  })

  it('P1-2 必填校验：必填项为空时提交被拦截，不发起提交请求', async () => {
    setupFormLoad()
    const wrapper = mount(FormVersionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    // 不填必填字段直接提交
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()

    expect(mockPost).not.toHaveBeenCalled()
  })
})
