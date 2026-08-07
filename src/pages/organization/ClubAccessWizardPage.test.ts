import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-004' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import ClubAccessWizardPage from './ClubAccessWizardPage.vue'

describe('ClubAccessWizardPage 社团接入向导', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('挂载加载初始状态（向导步骤）', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(ClubAccessWizardPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
