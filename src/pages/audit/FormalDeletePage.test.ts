import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  reauthenticate: vi.fn(),
}))

vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mocks.get(...args),
  post: (...args: unknown[]) => mocks.post(...args),
}))
vi.mock('@/services/modules', () => ({
  identityApi: { reauthenticate: (...args: unknown[]) => mocks.reauthenticate(...args) },
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import FormalDeletePage from './FormalDeletePage.vue'

const preview = {
  scope: 'all', targets: [{ id: 'club-001', label: '计算机协会', type: 'club', recordCount: 100, memberCount: 0 }],
  totalRecords: 100, totalMembers: 0, warning: '删除不可恢复', previewVersion: 1,
}

describe('FormalDeletePage 正式删除', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载预览成功：渲染删除范围', async () => {
    mocks.get.mockResolvedValue({ kind: 'completed', data: preview })
    const wrapper = mount(FormalDeletePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith('/admin/delete/preview')
    expect(wrapper.text()).toContain('计算机协会')
  })

  it('无活跃关系时展示可删除提示', async () => {
    mocks.get.mockResolvedValue({ kind: 'completed', data: preview })
    const wrapper = mount(FormalDeletePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('存在活跃关系，暂时无法删除')
  })

  it('加载失败：不渲染预览', async () => {
    mocks.get.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(FormalDeletePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('计算机协会')
  })
})
