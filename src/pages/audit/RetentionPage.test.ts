import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'vue-sonner'
import RetentionPage from './RetentionPage.vue'

describe('RetentionPage 数据保留策略', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染保留策略', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive' }] },
    })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/admin/retention')
    expect(wrapper.text()).toContain('application')
    expect(wrapper.text()).toContain('180')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('180')
  })

  it('执行保留策略被 202 异步受理：提示已受理并关闭执行弹窗，不误报失败', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive', status: 'draft', version: 1, updatedAt: '2026-08-01', publishedAt: null }] },
    })
    mockPost.mockResolvedValue({ kind: 'accepted', data: { taskId: 'task-1', status: 'pending' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('立即执行'))!.trigger('click')
    expect(wrapper.find('.hrc').exists()).toBe(true)
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/admin/retention/execute', expect.objectContaining({ reauthProof: 'mock-reauth-proof' }))
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('已受理'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(wrapper.find('.hrc').exists()).toBe(false)
    wrapper.unmount()
  })

  it('执行保留策略失败：错误传入弹窗展示而非永久卡“正在执行”', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { policies: [{ id: 'rt-1', scope: 'application', retentionDays: 180, action: 'archive', status: 'draft', version: 1, updatedAt: '2026-08-01', publishedAt: null }] },
    })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '执行被中断' } })
    const wrapper = mount(RetentionPage, { global: { stubs: pageStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('立即执行'))!.trigger('click')
    await wrapper.find('.hrc-confirm').trigger('click')
    await flushPromises()
    expect(wrapper.find('.hrc').exists()).toBe(true)
    expect(wrapper.find('.hrc').text()).toContain('执行被中断')
    wrapper.unmount()
  })
})
