import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', jointId: 'jnt-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'vue-sonner'
import JointClosePage from './JointClosePage.vue'

const detail = {
  id: 'jnt-1', title: '联合招新', status: 'concluding',
  participants: [{ clubId: 'club-001', clubName: '计算机协会', status: 'active', concludedCount: 3, invitationSent: 2, endConfirmed: false }],
  totalApplicants: 10, totalConcluded: 3, totalInvited: 2, canClose: false,
}

const closableDetail = { ...detail, canClose: true }

describe('JointClosePage 联合活动关闭', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染结束确认状态', async () => {
    mockGet.mockResolvedValue({ kind: 'completed', data: detail })
    const wrapper = mount(JointClosePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/close')
    expect(wrapper.text()).toContain('联合招新')
  })

  it('进入结束确认阶段成功：提示并刷新', async () => {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: closableDetail })
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: closableDetail })
    mockPost.mockResolvedValue({ kind: 'completed', data: {} })
    const wrapper = mount(JointClosePage, { global: { stubs: pageStubs } })
    await flushPromises()

    const startBtn = wrapper.findAll('button').find((b) => b.text().includes('进入结束确认'))
    expect(startBtn, '可关闭状态下应渲染"进入结束确认"按钮').toBeTruthy()
    await startBtn!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/close/start', {})
    expect(toast.success).toHaveBeenCalledWith('已进入结束确认阶段')
  })

  it('加载失败：不渲染详情', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(JointClosePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('联合招新')
  })
})
