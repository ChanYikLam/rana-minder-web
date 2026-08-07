import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, meta: { tab: 'activities' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import PublicCatalogPage from './PublicCatalogPage.vue'

describe('PublicCatalogPage 公开目录', () => {
  beforeEach(() => {
    mockGet.mockReset()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('加载成功：并行请求社团与活动并渲染（防抖后）', async () => {
    // 注意：mockResolvedValueOnce 优先于默认值，需按调用顺序（clubs 先、activities 后）设置
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { items: [{ id: 'club-1', name: '计算机协会', description: '技术社团', memberCount: 100, logo: null, layer: 'exact' }] },
    })
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        items: [{ id: 'act-1', clubId: 'club-1', clubName: '计算机协会', title: '秋季招新', type: 'recruitment', status: 'recruiting', enrolling: true, deadline: '2026-09-01T00:00:00Z', description: '招新', layer: 'exact' }],
        history: [],
      },
    })
    const wrapper = mount(PublicCatalogPage, { global: { stubs: pageStubs } })
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(wrapper.text()).toContain('秋季招新')
  })

  it('加载失败：清空结果进入错误态', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(PublicCatalogPage, { global: { stubs: pageStubs } })
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新')
  })
})
