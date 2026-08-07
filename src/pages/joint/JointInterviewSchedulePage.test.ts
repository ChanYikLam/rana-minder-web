import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { jointId: 'jnt-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import JointInterviewSchedulePage from './JointInterviewSchedulePage.vue'

const detail = {
  id: 'jiv-1', jointId: 'jnt-1', jointTitle: '联合招新面试', applicantName: '张三',
  status: 'scheduled', scheduledTime: '2026-08-10T04:00:00Z', attendance: 'pending',
  invalidReason: null, attempt: 1,
  availableSlots: [{ id: 's1', time: '2026-08-11T04:00:00Z', capacity: 5, booked: 2, available: 3 }],
}

describe('JointInterviewSchedulePage 联合面试排期', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染排期信息与可选时段', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(JointInterviewSchedulePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/interviews/joint/jnt-1')
    expect(wrapper.text()).toContain('联合招新面试')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(JointInterviewSchedulePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('联合招新面试')
  })
})
