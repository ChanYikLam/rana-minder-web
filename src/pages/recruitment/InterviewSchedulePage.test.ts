import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { interviewId: 'iv-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import InterviewSchedulePage from './InterviewSchedulePage.vue'

const detail = {
  id: 'iv-1', activityId: 'act-1', activityTitle: '秋季招新面试', applicantName: '张三',
  status: 'scheduled', attendance: 'pending', scheduledTime: '2026-08-10T04:00:00Z', location: 'A101',
  interviewers: [{ id: 'i1', name: '李思颖' }],
  availableSlots: [{ id: 's1', time: '2026-08-11T04:00:00Z', location: 'A102', capacity: 5, booked: 2 }],
}

describe('InterviewSchedulePage 招新面试排期', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染已排期信息', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(InterviewSchedulePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/interviews/recruitment/iv-1')
    expect(wrapper.text()).toContain('秋季招新面试')
    expect(wrapper.text()).toContain('A101')
  })

  it('未排期：展示可选时段', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { ...detail, scheduledTime: null, location: null } })
    const wrapper = mount(InterviewSchedulePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('A102')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(InterviewSchedulePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('秋季招新面试')
  })
})
