import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 工厂之前可用
const { mockGet, mockPost, mockPush } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', formId: 'form-001' }, path: '/org/club-001/forms/designer/form-001', meta: {} }),
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import FormDesignerPage from './FormDesignerPage.vue'

const commonStubs = {
  PageStateBoundary: { template: '<div><slot /></div>' },
  Card: { template: '<div class="card"><slot /></div>' },
}

function mockDesigner(status: string, version = 1) {
  return {
    id: 'form-001',
    title: '招新报名表',
    status,
    version,
    fields: [{ id: 'f1', type: 'text', label: '姓名', required: true, readonly: false, permission: 'read_write', options: null, description: null }],
  }
}

/** 渲染组件并等待首屏数据加载完成 */
async function mountPage(status: string) {
  mockGet.mockResolvedValueOnce({ kind: 'completed' as const, data: mockDesigner(status) })
  const wrapper = mount(FormDesignerPage, { global: { stubs: commonStubs } })
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('FormDesignerPage P2-1：发布按钮状态收敛（SM-FORM-001）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('draft 态：展示发布按钮', async () => {
    const wrapper = await mountPage('draft')
    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('发布'))
    expect(publishBtn).toBeTruthy()
  })

  it('published 态：不展示发布按钮（已发布不可再发布）', async () => {
    const wrapper = await mountPage('published')
    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('发布'))
    expect(publishBtn).toBeUndefined()
    // 停用/克隆按钮仍可见
    expect(wrapper.text()).toContain('停用')
    expect(wrapper.text()).toContain('克隆')
  })

  it('deprecated 态：不展示发布按钮（停用后需先复用）', async () => {
    const wrapper = await mountPage('deprecated')
    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('发布'))
    expect(publishBtn).toBeUndefined()
    // 复用/克隆按钮仍可见
    expect(wrapper.text()).toContain('复用')
    expect(wrapper.text()).toContain('克隆')
  })
})
