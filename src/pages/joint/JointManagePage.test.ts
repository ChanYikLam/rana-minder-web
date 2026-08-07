import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', jointId: 'jnt-1' }, meta: { mode: 'manage' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import JointManagePage from './JointManagePage.vue'

const detail = {
  id: 'jnt-1', title: '联合招新', description: '跨社招新', status: 'recruiting', channelStatus: 'open',
  deadline: '2026-09-01T00:00:00Z',
  participants: [{ clubId: 'club-001', clubName: '计算机协会', status: 'active', concludedCount: 2 }],
  applicantCount: 10, version: 1,
}

describe('JointManagePage 联合活动管理', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('管理态：加载详情并渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/joint/jnt-1')
    expect(wrapper.text()).toContain('联合招新')
    expect(wrapper.text()).toContain('计算机协会')
  })

  it('加载失败：不渲染详情', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(JointManagePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('联合招新')
  })
})
