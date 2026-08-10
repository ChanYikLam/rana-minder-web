import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { pageStubs } from '@/test-utils/pageStubs'

const { mockGet, mockPost, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockPut: vi.fn() }))
const mockResolveSyncConflict = vi.hoisted(() => vi.fn())
const mockRouterPush = vi.hoisted(() => vi.fn())
// routeMeta 由 hoisted 工厂创建：ProfilePage 通过 watch(route.meta.mode) 感知路由切换（审计 P2-1），
// 需用 Vue 的 reactive 包装以保证 watcher 触发。Vue 对同一 target 缓存代理，组件与测试共享同一实例。
const routeMeta = vi.hoisted(() => ({ raw: { mode: '' }, proxy: null as unknown as { mode: string } }))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  routeMeta.proxy = reactive(routeMeta.raw)
  return {
    useRoute: () => ({ params: {}, meta: routeMeta.proxy }),
    useRouter: () => ({ push: (...args: unknown[]) => mockRouterPush(...args) }),
  }
})
vi.mock('@/services/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
}))
vi.mock('@/services/modules', () => ({
  identityApi: {
    resolveSyncConflict: (...args: unknown[]) => mockResolveSyncConflict(...args),
  },
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
    mockResolveSyncConflict.mockReset()
    mockRouterPush.mockReset()
    vi.clearAllMocks()
    routeMeta.raw.mode = ''
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
    wrapper.unmount()
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

  it('P0-3 sync-conflict 模式：拉取真实资料与冲突清单，不渲染硬编码占位数据', async () => {
    routeMeta.raw.mode = 'sync-conflict'
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

  it('sync-conflict 模式：加载失败后点击重试能重新加载冲突清单（修复重试死循环）', async () => {
    routeMeta.raw.mode = 'sync-conflict'
    // 首次 GET /auth/profile 失败 → 进入错误态
    mockGet.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '网络错误' } })
    // 重试：GET /auth/profile 成功 + GET /auth/profile/sync-conflicts 成功
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { version: 1, studentId: '20210002', name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002', emailVerified: true, profileComplete: true, syncStatus: { email: 'synced', phone: 'synced' } },
    })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { conflicts: [{ field: 'name', label: '姓名', localValue: '张明远', remoteValue: '张铭远' }], local: { name: '张明远', studentId: '20210002', email: 'leader@example.edu.cn', phone: '13800000002' } },
    })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 首次失败进入错误态，渲染重试按钮
    const retryBtn = wrapper.find('.psb-retry')
    expect(retryBtn.exists()).toBe(true)
    await retryBtn.trigger('click')
    await flushPromises()
    // 重试后重新拉取了资料与冲突清单
    expect(mockGet).toHaveBeenCalledTimes(3)
    expect(mockGet).toHaveBeenNthCalledWith(1, '/auth/profile')
    expect(mockGet).toHaveBeenNthCalledWith(2, '/auth/profile')
    expect(mockGet).toHaveBeenNthCalledWith(3, '/auth/profile/sync-conflicts')
    // 冲突清单渲染成功，不再停留在错误态
    expect(wrapper.text()).toContain('张铭远')
    wrapper.unmount()
  })

  it('sync-conflict 模式：冲突解决中途失败后重新拉取冲突清单（避免已解决字段重复提交）', async () => {
    routeMeta.raw.mode = 'sync-conflict'
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { version: 1, studentId: '20210002', name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002', emailVerified: true, profileComplete: true, syncStatus: { email: 'synced', phone: 'synced' } },
    })
    // 首次拉取冲突清单：两个冲突字段
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: {
        conflicts: [
          { field: 'name', label: '姓名', localValue: '张明远', remoteValue: '张铭远' },
          { field: 'phone', label: '手机号', localValue: '13800000002', remoteValue: '13900000002' },
        ],
        local: { name: '张明远', studentId: '20210002', email: 'leader@example.edu.cn', phone: '13800000002' },
      },
    })
    // 写回：第一个字段成功，第二个字段失败
    mockResolveSyncConflict.mockResolvedValueOnce({ kind: 'completed', data: {} })
    mockResolveSyncConflict.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-006', message: '不支持的冲突字段' } })
    // 失败后重新拉取冲突清单
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { conflicts: [{ field: 'phone', label: '手机号', localValue: '13800000002', remoteValue: '13900000002' }], local: { name: '张铭远', studentId: '20210002', email: 'leader@example.edu.cn', phone: '13800000002' } },
    })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    const resolveBtn = wrapper.findAll('button').find((b) => b.text() === '解决冲突')
    expect(resolveBtn).toBeTruthy()
    await resolveBtn!.trigger('click')
    await flushPromises()
    // 两个字段都被提交，失败后重新拉取冲突清单
    expect(mockResolveSyncConflict).toHaveBeenCalledTimes(2)
    expect(mockGet).toHaveBeenCalledTimes(3)
    expect(mockGet).toHaveBeenNthCalledWith(3, '/auth/profile/sync-conflicts')
    wrapper.unmount()
  })

  it('审计 P3：sync-conflict 模式冲突清单为空时自动跳转 /me/profile', async () => {
    routeMeta.raw.mode = 'sync-conflict'
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { version: 1, studentId: '20210002', name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002', emailVerified: true, profileComplete: true, syncStatus: { email: 'synced', phone: 'synced' } },
    })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { conflicts: [], local: { name: '张明远', studentId: '20210002', email: 'leader@example.edu.cn', phone: '13800000002' } },
    })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    // 空冲突：提示后自动跳转普通资料页
    expect(mockRouterPush).toHaveBeenCalledWith('/me/profile')
    expect(wrapper.text()).not.toContain('冲突字段')
    wrapper.unmount()
  })

  it('审计 P2-1：组件实例被路由复用时切入 sync-conflict 模式会重置旧状态并重新加载', async () => {
    // 先以普通模式挂载（渲染过 profile），模拟组件实例已被复用
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { version: 1, studentId: '20210001', name: '陈雨桐', email: 'e@example.edu.cn', phone: '13800000001', emailVerified: true, profileComplete: true, syncStatus: {} },
    })
    const wrapper = mount(ProfilePage, { global: { stubs: pageStubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('陈雨桐')

    // 路由切换到 sync-conflict 模式：触发 watcher → 重新加载资料 + 冲突清单
    // 通过 reactive 代理修改（与组件 useRoute 返回的是同一个代理）
    routeMeta.proxy.mode = 'sync-conflict'
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { version: 1, studentId: '20210002', name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002', emailVerified: true, profileComplete: true, syncStatus: { email: 'synced', phone: 'synced' } },
    })
    mockGet.mockResolvedValueOnce({
      kind: 'completed',
      data: { conflicts: [{ field: 'name', label: '姓名', localValue: '张明远', remoteValue: '张铭远' }], local: { name: '张明远', studentId: '20210002', email: 'leader@example.edu.cn', phone: '13800000002' } },
    })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()
    // 重新拉取了资料与冲突清单，旧 profile 状态被刷新
    expect(mockGet).toHaveBeenCalledWith('/auth/profile/sync-conflicts')
    expect(wrapper.text()).toContain('张铭远')
    wrapper.unmount()
  })
})
