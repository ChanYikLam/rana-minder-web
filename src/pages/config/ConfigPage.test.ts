import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/org/club-001/config', params: { clubId: 'club-001' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'vue-sonner'
import ConfigPage from './ConfigPage.vue'

describe('ConfigPage 社团配置', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：回填配置并渲染', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { clubName: '计算机协会', clubDescription: '技术社团', maxMembers: 300 },
    })
    const wrapper = mount(ConfigPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/config')
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('计算机协会')
    expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('300')
  })

  it('保存成功：不报错', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: {} })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ConfigPage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/config', expect.any(Object))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('保存失败：toast 提示', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: {} })
    mockPost.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ConfigPage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(toast.error).toHaveBeenCalledWith('保存失败，请重试')
  })
})
