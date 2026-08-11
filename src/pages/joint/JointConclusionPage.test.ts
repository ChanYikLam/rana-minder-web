import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { clubId: 'club-001', jointId: 'jnt-1' } }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

import JointConclusionPage from './JointConclusionPage.vue'

describe('JointConclusionPage 联合结论与邀请', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染结论列表', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'c-1', applicantName: '张三', departmentName: '技术部', status: 'concluded', rating: 4 }] },
    })
    const wrapper = mount(JointConclusionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/org/club-001/joint/jnt-1/conclusions')
    expect(wrapper.text()).toContain('张三')
  })

  it('加载失败：不渲染', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(JointConclusionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
  })

  it('越权码（IFC-ERR-003）映射 forbidden：不渲染结论', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(JointConclusionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('张三')
    wrapper.unmount()
  })

  it('非状态机状态（expired/rejected）不再走特殊分支，由兜底渲染（SM-JNT-005 无此二态）', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: { items: [{ id: 'c-2', applicantName: '李四', departmentName: '技术部', status: 'expired', rating: null }] },
    })
    const wrapper = mount(JointConclusionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 不出现“逾期未处理”特殊文案
    expect(wrapper.text()).not.toContain('逾期未处理')
    // 状态经 StateTag 渲染（兜底），不崩溃
    expect(wrapper.text()).toContain('李四')
    wrapper.unmount()
  })

  it('P1-18：同名申请人按 applicantId 分组不串号，邀请按 applicantId 挂靠对应组', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/conclusions')) {
        return Promise.resolve({
          kind: 'completed',
          data: {
            items: [
              { id: 'c-1', applicantId: 'u-1', applicantName: '张三', clubId: 'club-001', clubName: '计算机协会', status: 'concluded', conclusion: 'admit', reviewFlag: false, rating: 4, comment: '', concludedAt: '2026-01-01T00:00:00', myClub: true },
              { id: 'c-2', applicantId: 'u-2', applicantName: '张三', clubId: 'club-002', clubName: '技术协会', status: 'concluded', conclusion: 'admit', reviewFlag: false, rating: 5, comment: '', concludedAt: '2026-01-01T00:00:00', myClub: false },
            ],
          },
        })
      }
      return Promise.resolve({
        kind: 'completed',
        data: {
          items: [
            { id: 'inv-1', applicantId: 'u-1', applicantName: '张三', clubId: 'club-001', status: 'accepted', sentAt: 'x', expiredAt: 'x' },
          ],
        },
      })
    })
    const wrapper = mount(JointConclusionPage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 同名两人各自成组（2 个组头），不被按姓名合并
    expect(wrapper.findAll('p.text-base.font-medium')).toHaveLength(2)
    // 邀请仅出现在 u-1（计算机协会）组下，u-2 组无邀请 —— 按姓名匹配的旧实现会两处都出现
    expect(wrapper.text().split('已发送的邀请')).toHaveLength(2)
    wrapper.unmount()
  })
})
