import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}))

import MyInterviewTasksPage from './MyInterviewTasksPage.vue'

const task = {
  id: 'task-1', type: 'interview', activityId: 'act-1', activityTitle: '秋季招新面试', clubId: 'club-001', clubName: '计算机协会',
  applicantId: 'app-1', applicantName: '张三', roundId: 'r1', roundName: '一轮',
  status: 'scheduled', startAt: '2026-08-10T04:00:00Z', endAt: '2026-08-10T04:30:00Z',
  attendance: 'pending', conflict: { conflict: false },
}

describe('MyInterviewTasksPage 我的面试任务', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染任务并分组', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [task] } })
    const wrapper = mount(MyInterviewTasksPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/me/interviews/tasks')
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('秋季招新面试')
  })

  it('空列表：展示空态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [] } })
    const wrapper = mount(MyInterviewTasksPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无')
  })

  it('加载失败：不渲染任务', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(MyInterviewTasksPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })

  it('未排期任务显示"未排期"', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: { items: [{ ...task, startAt: null, endAt: null }] } })
    const wrapper = mount(MyInterviewTasksPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('未排期')
  })
})
