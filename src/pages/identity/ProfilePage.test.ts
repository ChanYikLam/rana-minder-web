import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPut: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, meta: {} }),
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

  it('加载失败（IFC-ERR-003 无权限）：进入 forbidden（P3-2 统一映射）', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-003', message: '无权限' } })
    const wrapper = mount(ProfilePage, {
      global: {
        stubs: {
          ...pageStubs,
          PageStateBoundary: {
            props: ['state'],
            template: '<div class="psb" :data-state="state"><slot /></div>',
          },
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('.psb').attributes('data-state')).toBe('forbidden')
    wrapper.unmount()
  })

  it('加载失败（IFC-ERR-004 作用域外）：进入 forbidden（P3-2：不再手写集合遗漏）', async () => {
    mockGet.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-004', message: '作用域外' } })
    const wrapper = mount(ProfilePage, {
      global: {
        stubs: {
          ...pageStubs,
          PageStateBoundary: {
            props: ['state'],
            template: '<div class="psb" :data-state="state"><slot /></div>',
          },
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('.psb').attributes('data-state')).toBe('forbidden')
    wrapper.unmount()
  })

  it('加载失败（IFC-ERR-014 处理中）：进入 error 而非 loading（P2-2 不卡加载）', async () => {
    mockGet.mockResolvedValue({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } })
    const wrapper = mount(ProfilePage, {
      global: {
        stubs: {
          ...pageStubs,
          PageStateBoundary: {
            props: ['state'],
            template: '<div class="psb" :data-state="state"><slot /></div>',
          },
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('.psb').attributes('data-state')).toBe('error')
    wrapper.unmount()
  })
})
