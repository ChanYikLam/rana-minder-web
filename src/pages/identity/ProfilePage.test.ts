import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPut: vi.fn() }))
const routeMeta = vi.hoisted(() => ({ mode: '' }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, meta: routeMeta }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
}))
vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import ProfilePage from './ProfilePage.vue'

describe('ProfilePage 个人资料', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    vi.clearAllMocks()
    routeMeta.mode = ''
    // P3-1 新增：ProfilePage 保存/验证后联动刷新会话（useSessionViewStore），需安装 pinia
    setActivePinia(createPinia())
  })
  afterEach(() => vi.restoreAllMocks())

  it('加载成功：渲染个人资料', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        user: { id: 'u1', studentId: '20210001', name: '陈雨桐', email: 'e@example.edu.cn', phone: '13800000001', avatar: null, emailVerified: true, profileComplete: true },
        profileGate: { complete: true, emailVerified: true },
        fields: [],
        version: 1,
      },
    })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/auth/profile')
    expect(wrapper.text()).toContain('个人资料')
  })

  it('编辑后原样提交：不调用 PUT，直接退出编辑态（MRM-007 边界）', async () => {
    mockGet.mockResolvedValue({
      kind: 'completed',
      data: {
        version: 1,
        studentId: '20210001',
        name: '陈雨桐',
        email: 'e@example.edu.cn',
        phone: '13800000001',
        emailVerified: true,
        profileComplete: true,
        syncStatus: { email: 'synced', phone: 'synced' },
      },
    })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    await wrapper.find('button').trigger('click') // 编辑资料
    await flushPromises()
    // 不做任何修改，直接保存
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === '保存')
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()
    // 页面未上送（无实际差异的提交被短路）
    expect(mockPut).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('编辑资料')
    wrapper.unmount()
  })

  it('加载失败：不渲染资料字段', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('手机号')
    expect(wrapper.text()).not.toContain('身份信息')
    wrapper.unmount()
  })

  it('P0-3 sync-conflict 模式：拉取真实资料与冲突清单，不渲染硬编码占位数据', async () => {
    routeMeta.mode = 'sync-conflict'
    // 首个 GET（/auth/profile）返回真实资料，第二个 GET（/auth/profile/sync-conflicts）返回真实冲突
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { version: 1, studentId: '20210002', name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002', emailVerified: true, profileComplete: true, syncStatus: { email: 'synced', phone: 'synced' } },
    })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { conflicts: [{ field: 'name', label: '姓名', localValue: '张明远', remoteValue: '张铭远' }], local: { name: '张明远', studentId: '20210002', email: 'leader@example.edu.cn', phone: '13800000002' } },
    })
    const wrapper = mount(ProfilePage, {
      global: { stubs: pageStubs },
    })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/auth/profile')
    expect(mockGet).toHaveBeenCalledWith('/auth/profile/sync-conflicts')
    // 渲染真实冲突值而非硬编码占位（陈小明/2024110101）
    expect(wrapper.text()).toContain('张明远')
    expect(wrapper.text()).toContain('张铭远')
    expect(wrapper.text()).not.toContain('陈小明')
    expect(wrapper.text()).not.toContain('2024110101')
    wrapper.unmount()
  })
})
