import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const { mockGet, mockPost, mockPush } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { jointId: 'jnt-001' }, meta: {} }),
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}))

vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'vue-sonner'
import JointApplyPage from './JointApplyPage.vue'

const mockDetail = {
  title: '联合招新',
  clubName: '网络协会',
  participants: [{ id: 'club-001', name: '计算机协会' }],
  clubs: [{ id: 'club-001', name: '计算机协会', departments: [{ id: 'dept-1', name: '技术部' }] }],
  description: '跨社团联合招新',
  channelStatus: 'open',
  deadline: '2099-12-31T23:59:59Z',
}
const mockFormFields = [{ id: 'f1', type: 'text', label: '姓名', description: null, required: true, readonly: false, permission: 'read_write', options: null }]

function setupGetMocks(application: unknown = null, detailOverrides: Record<string, unknown> = {}) {
  mockGet.mockReset()
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { ...mockDetail, ...detailOverrides } })
  mockGet.mockResolvedValueOnce({ kind: 'completed', data: { versions: [{ fields: mockFormFields }] } })
  if (application) {
    mockGet.mockResolvedValueOnce({ kind: 'completed', data: application })
  } else {
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-015', message: '不存在' } })
  }
}

const commonStubs = {
  PageStateBoundary: { template: '<div><slot /></div>' },
  Card: { template: '<div class="card"><slot /></div>' },
}

describe('JointApplyPage 交互流程', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('必填项为空：校验拦截，不发请求', async () => {
    setupGetMocks()
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 勾选同意（否则提交按钮禁用）
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    await wrapper.findAll('button').find((b) => b.text().includes('提交联合报名'))!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('姓名为必填项')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('未勾选同意协议时提交按钮禁用', async () => {
    setupGetMocks()
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('提交联合报名'))!
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('提交成功：先建草稿再提交，payload 符合契约并跳转个人中心', async () => {
    setupGetMocks()
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 参与社团默认预选为意向社团：填写必填项 + 添加部门意向 + 勾选同意
    await wrapper.find('input[type="text"]').setValue('张三')
    await wrapper.findAll('button').find((b) => b.text().includes('技术部'))!.trigger('click')
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)

    mockPost
      .mockResolvedValueOnce({ kind: 'completed', data: {} }) // 创建草稿
      .mockResolvedValueOnce({ kind: 'completed', data: {} }) // 提交
    await wrapper.findAll('button').find((b) => b.text().includes('提交联合报名'))!.trigger('click')
    await flushPromises()
    await nextTick()

    expect(mockPost).toHaveBeenNthCalledWith(1, '/activity/joint/jnt-001/draft', {})
    expect(mockPost).toHaveBeenNthCalledWith(2, '/activity/joint/jnt-001/apply', {
      consented: true,
      allowJointAdjustment: false,
      volunteerClubIds: ['club-001'],
      preferences: [{ departmentId: 'dept-1', departmentName: '技术部' }],
      answers: { f1: '张三' },
    })
    expect(toast.success).toHaveBeenCalledWith('联合报名已提交')
    expect(mockPush).toHaveBeenCalledWith('/me/ongoing')
  })

  it('意向社团联动：取消选择时清理该社团下的部门意向', async () => {
    setupGetMocks()
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    // 参与社团默认预选：部门按钮已出现，选择部门意向
    await wrapper.findAll('button').find((b) => b.text().includes('技术部'))!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('1技术部')

    // 取消意向社团 → 部门意向被联动清理
    await wrapper.findAll('button').find((b) => b.text().includes('计算机协会'))!.trigger('click')
    await nextTick()
    expect(wrapper.text()).not.toContain('技术部')
    expect(wrapper.text()).toContain('请先在上方选择意向社团，再添加部门意向')
  })

  it('草稿态回填：答案/意向社团/同意状态恢复', async () => {
    setupGetMocks({
      status: 'draft',
      answers: { f1: '草稿内容' },
      volunteerClubIds: ['club-001'],
      preferences: [{ departmentId: 'dept-1', departmentName: '技术部' }],
      consented: true,
      allowJointAdjustment: true,
    })
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('草稿内容')
    expect(wrapper.text()).toContain('您有已保存的草稿')
    expect(wrapper.text()).toContain('1技术部')
    expect((wrapper.findAll('input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(true)
  })

  it('提交被拒绝：展示服务端错误且不跳转', async () => {
    setupGetMocks()
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    await wrapper.find('input[type="text"]').setValue('张三')
    await wrapper.findAll('button').find((b) => b.text().includes('计算机协会'))!.trigger('click')
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)

    mockPost
      .mockResolvedValueOnce({ kind: 'completed', data: {} })
      .mockResolvedValueOnce({ kind: 'rejected', error: { code: 'REC-CLOSED', message: '报名通道已关闭' } })
    await wrapper.findAll('button').find((b) => b.text().includes('提交联合报名'))!.trigger('click')
    await flushPromises()
    await nextTick()

    expect(toast.error).toHaveBeenCalledWith('报名通道已关闭')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('通道开放态展示绿色提示', async () => {
    setupGetMocks()
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('报名通道开放中')
  })

  it('通道关闭态展示关闭提示（danger 色调类）', async () => {
    setupGetMocks(null, { channelStatus: 'closed' })
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('报名通道已关闭')
    expect(wrapper.html()).toContain('bg-danger-subtle text-danger')
  })

  it('未知通道状态回退中性提示', async () => {
    setupGetMocks(null, { channelStatus: 'weird' })
    const wrapper = mount(JointApplyPage, { global: { stubs: commonStubs } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('报名通道状态未知')
  })
})
