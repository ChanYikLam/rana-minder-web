import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ClubSwitcher from './ClubSwitcher.vue'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useSessionViewStore } from '@/state/sessionViewStore'

const mocks = vi.hoisted(() => ({
  getMyClubs: vi.fn(),
  getContext: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/services', () => ({
  identityApi: { getMyClubs: (...args: unknown[]) => mocks.getMyClubs(...args) },
  organizationApi: { getContext: (...args: unknown[]) => mocks.getContext(...args) },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

// 下拉菜单（reka-ui）在 happy-dom 下渲染不稳定，改用原生按钮触发内部逻辑
// M-2：必须声明 emits: ['click'] 阻止 Vue 3 fallthrough——
// 否则 SFC 的 @click="switchClub(club)" 会同时作为组件事件监听器（由 $emit 触发）
// 和 DOM fallthrough 监听器（直接绑到 button 上），一次点击导致 switchClub 被调用两次
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: { template: '<div class="dd"><slot /></div>' },
  DropdownMenuTrigger: { template: '<div class="dd-trigger"><slot /></div>' },
  DropdownMenuContent: { template: '<div class="dd-content"><slot /></div>' },
  DropdownMenuItem: { emits: ['click'], template: '<button type="button" class="dd-item" @click="$emit(\'click\')"><slot /></button>' },
  DropdownMenuLabel: { template: '<div><slot /></div>' },
  DropdownMenuSeparator: { template: '<div />' },
}))

import type { User } from '@/types/domain'

function seedSession(permissions: string[] = ['platform:club:manage', 'club:dashboard:view']) {
  const session = useSessionViewStore()
  session.user = {
    id: 'user-001',
    studentId: '20210001',
    name: '陈雨桐',
    email: 'admin@example.edu.cn',
    phone: '13800000001',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
  } as User
  session.permissions = permissions
  return session
}

describe('ClubSwitcher 社团切换', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountSwitcher() {
    const wrapper = mount(ClubSwitcher, {
      global: { stubs: { LoaderCircle: { template: '<i />' }, ChevronDown: { template: '<i />' }, Building2: { template: '<i />' }, Check: { template: '<i />' } } },
    })
    await flushPromises()
    return wrapper
  }

  it('挂载后加载我的社团列表', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' }] },
    })

    const wrapper = await mountSwitcher()

    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)
    const items = wrapper.findAll('.dd-item')
    expect(items.some((i) => i.text().includes('电子设计协会'))).toBe(true)
  })

  it('切换成功：同步会话工作空间与权限并跳转新社团看板', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001', 'mem-001')
    const session = seedSession(['platform:club:manage', 'club:dashboard:view'])
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' }] },
    })
    // 新社团上下文：无成员身份（memberId=null），权限为社团级视图权限
    mocks.getContext.mockResolvedValue({
      kind: 'completed',
      data: { clubId: 'club-002', clubName: '电子设计协会', role: 'hr', permissions: ['club:member:view-self', 'club:dashboard:view'], memberId: null },
    })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('电子设计协会'))!
    await item.trigger('click')
    await flushPromises()

    expect(mocks.getContext).toHaveBeenCalledWith('club-002')
    // 会话工作空间同步为新社团上下文；memberId 不得沿用 club-001 的 mem-001（防串身份）
    expect(session.workspace).toEqual({
      clubId: 'club-002',
      clubName: '电子设计协会',
      role: 'hr',
      memberId: undefined,
    })
    // 权限合并：保留 platform:*，仅以新社团权限覆盖 club:* 域
    expect(session.permissions).toEqual(['platform:club:manage', 'club:member:view-self', 'club:dashboard:view'])
    // P2-6：新社团有 club:dashboard:view 时跳转新社团看板
    expect(mocks.push).toHaveBeenCalledWith('/org/club-002/dashboard')
  })

  it('切换成功：新社团无 dashboard 权限时回退平台管理（P2-6）', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001', 'mem-001')
    seedSession(['platform:club:manage', 'club:dashboard:view'])
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' }] },
    })
    // 新社团上下文仅含成员级权限，无 dashboard 权限——不再硬跳无权限页
    mocks.getContext.mockResolvedValue({
      kind: 'completed',
      data: { clubId: 'club-002', clubName: '电子设计协会', role: 'hr', permissions: ['club:member:view-self'], memberId: 'mem-020' },
    })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('电子设计协会'))!
    await item.trigger('click')
    await flushPromises()

    expect(mocks.push).toHaveBeenCalledWith('/admin/clubs')
    wrapper.unmount()
  })

  it('切换成功：新社团有成员身份时写入新 memberId', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001', 'mem-001')
    const session = seedSession()
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '电子设计协会', role: 'member' }] },
    })
    mocks.getContext.mockResolvedValue({
      kind: 'completed',
      data: { clubId: 'club-002', clubName: '电子设计协会', role: 'member', permissions: [], memberId: 'mem-020' },
    })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('电子设计协会'))!
    await item.trigger('click')
    await flushPromises()

    expect(session.workspace?.memberId).toBe('mem-020')
  })

  it('切换到当前社团：不重复加载与跳转', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    seedSession()
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }] },
    })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item')[0]
    await item.trigger('click')
    await flushPromises()

    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.getContext).not.toHaveBeenCalled()
  })

  it('loadWorkspace 失败：不切换会话状态', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    const session = seedSession()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-001' }
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' }] },
    })
    mocks.getContext.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('电子设计协会'))!
    await item.trigger('click')
    await flushPromises()

    expect(session.workspace?.clubId).toBe('club-001')
    expect(session.workspace?.memberId).toBe('mem-001')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('加载失败（rejected）：列表保持为空并展示空态', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    mocks.getMyClubs.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })

    const wrapper = await mountSwitcher()

    // P2-14：加载失败明确提示错误并可重试，不再误导"暂无加入的社团"
    expect(wrapper.text()).toContain('社团列表加载失败')
    expect(wrapper.text()).toContain('重试')
  })

  it('重复加载去重：加载成功后不重复请求', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }] },
    })

    const wrapper = await mountSwitcher()
    await flushPromises()
    // 再次触发加载（模拟下拉重新打开）
    await wrapper.find('.dd-trigger').trigger('open-change')
    await flushPromises()

    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)
  })

  it('P2-16：换账号（user.id 变化）后旧列表作废，再次打开下拉时重新拉取', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    const session = seedSession()
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }] },
    })

    const wrapper = await mountSwitcher()
    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)

    // 换账号：user.id 变化 → 旧列表立即作废
    session.user = { ...session.user!, id: 'user-002' }
    await flushPromises()
    // 再次打开下拉 → 触发重新拉取（旧逻辑 clubs.length>0 会直接跳过）
    await wrapper.find('.dd-trigger').trigger('open-change')
    await flushPromises()

    expect(mocks.getMyClubs).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('P2-16：会话重载（lastLoadedAt 更新）后强制刷新社团列表', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    const session = seedSession()
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }] },
    })

    const wrapper = await mountSwitcher()
    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)

    // 模拟会话重载（加入新社团/角色变更后 loadSession 刷新）：即使 clubs 已缓存也强制拉取
    session.lastLoadedAt = Date.now()
    await flushPromises()

    expect(mocks.getMyClubs).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('P2-16：换账号时旧账号在途请求完成后不污染新账号菜单（代次校验）', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    const session = seedSession()
    // 首请求挂起（不 resolve），模拟旧账号 getMyClubs 在途
    let resolveOld!: (v: unknown) => void
    const oldPending = new Promise((r) => { resolveOld = r })
    mocks.getMyClubs.mockReturnValueOnce(oldPending)

    const wrapper = mount(ClubSwitcher, {
      global: { stubs: { LoaderCircle: { template: '<i />' }, ChevronDown: { template: '<i />' }, Building2: { template: '<i />' }, Check: { template: '<i />' } } },
    })
    await flushPromises()
    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)

    // 换账号：user.id 变化 → 清空旧列表、代次递增
    session.user = { ...session.user!, id: 'user-002' }
    await flushPromises()

    // 旧账号请求此刻才完成，返回旧数据
    resolveOld({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-999', clubName: '旧社团', role: 'club_leader' }] },
    })
    await flushPromises()

    // 代次已变 → 结果被丢弃，新账号菜单不显示旧社团
    expect(wrapper.findAll('.dd-item').length).toBe(0)
    expect(wrapper.text()).not.toContain('旧社团')
    wrapper.unmount()
  })

  it('P2-16：lastLoadedAt 强制刷新在 loading 中被标记，加载结束后再补一次', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    const session = seedSession()
    // 首请求挂起，使 loading 保持为 true
    let resolveFirst!: (v: unknown) => void
    const firstPending = new Promise((r) => { resolveFirst = r })
    mocks.getMyClubs
      .mockReturnValueOnce(firstPending)
      .mockResolvedValue({
        kind: 'completed',
        data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }] },
      })

    const wrapper = mount(ClubSwitcher, {
      global: { stubs: { LoaderCircle: { template: '<i />' }, ChevronDown: { template: '<i />' }, Building2: { template: '<i />' }, Check: { template: '<i />' } } },
    })
    await flushPromises()
    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)

    // loading 中触发 lastLoadedAt 强制刷新：不应被静默丢弃，而应标记待补位
    session.lastLoadedAt = Date.now()
    await flushPromises()
    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)

    // 首次请求完成 → finally 中补位强制刷新 → 再次拉取
    resolveFirst({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }] },
    })
    await flushPromises()

    expect(mocks.getMyClubs).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('P2-16：强制刷新失败后保留旧缓存，点击重试能强制重新拉取', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    const session = seedSession()
    // 首次加载成功，缓存 club-001
    mocks.getMyClubs.mockResolvedValueOnce({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }] },
    })
    // lastLoadedAt 强制刷新失败：clubs 仍保留旧数据、clubsSessionKey 不变，但进入错误态
    mocks.getMyClubs.mockResolvedValueOnce({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    // 重试成功
    mocks.getMyClubs.mockResolvedValueOnce({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' }] },
    })

    const wrapper = await mountSwitcher()
    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)

    // 会话重载触发强制刷新，但本次失败 → 展示错误态，旧列表仍保留
    session.lastLoadedAt = Date.now()
    await flushPromises()
    expect(mocks.getMyClubs).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('社团列表加载失败')

    // 点击重试：因旧缓存命中短路，普通 loadClubs() 会被 return；改为 loadClubs(true) 后应强制重新拉取
    const retry = wrapper.findAll('button').find((b) => b.text().includes('重试'))!
    await retry.trigger('click')
    await flushPromises()

    expect(mocks.getMyClubs).toHaveBeenCalledTimes(3)
    // 重试成功，错误态消失、新社团出现在菜单
    expect(wrapper.text()).not.toContain('社团列表加载失败')
    expect(wrapper.findAll('.dd-item').some((i) => i.text().includes('电子设计协会'))).toBe(true)
    wrapper.unmount()
  })

  it('M-2：快速切换 B→C,C 早返回、B 晚返回时 store 状态与会话工作空间均为 C,导航落点为 C', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001', 'mem-001')
    const session = seedSession(['platform:club:manage', 'club:dashboard:view'])
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-001' }
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [
        { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
        { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' },
        { clubId: 'club-003', clubName: '摄影协会', role: 'member' },
      ] },
    })
    // B 挂起（晚返回）, C 立即成功（早返回）
    let resolveB!: (v: unknown) => void
    const promiseB = new Promise((r) => { resolveB = r })
    mocks.getContext
      .mockReturnValueOnce(promiseB)
      .mockResolvedValueOnce({
        kind: 'completed',
        data: { clubId: 'club-003', clubName: '摄影协会', role: 'member', permissions: ['club:dashboard:view'], memberId: 'mem-C' },
      })

    const wrapper = await mountSwitcher()
    const itemB = wrapper.findAll('.dd-item').find((i) => i.text().includes('电子设计协会'))!
    const itemC = wrapper.findAll('.dd-item').find((i) => i.text().includes('摄影协会'))!

    // 快速连点 B 后立即 C（不 await,让两个请求同时在飞）
    const pClickB = itemB.trigger('click')
    const pClickC = itemC.trigger('click')
    await Promise.all([pClickB, pClickC])
    await flushPromises()

    // C 先返回：store 与 session 应已是 C
    expect(workspace.currentClubId).toBe('club-003')
    expect(workspace.currentClubName).toBe('摄影协会')
    expect(workspace.currentMemberId).toBe('mem-C')
    expect(session.workspace).toEqual({
      clubId: 'club-003',
      clubName: '摄影协会',
      role: 'member',
      memberId: 'mem-C',
    })
    // 导航落点为 C 的看板
    expect(mocks.push).toHaveBeenCalledWith('/org/club-003/dashboard')

    // C 先返回：store 与 session 应已是 C
    expect(workspace.currentClubId).toBe('club-003')
    expect(workspace.currentClubName).toBe('摄影协会')
    expect(workspace.currentMemberId).toBe('mem-C')
    expect(session.workspace).toEqual({
      clubId: 'club-003',
      clubName: '摄影协会',
      role: 'member',
      memberId: 'mem-C',
    })
    // 导航落点为 C 的看板
    expect(mocks.push).toHaveBeenCalledWith('/org/club-003/dashboard')

    // B 此时才返回（晚到）——store / session / 导航均不得被 B 覆盖
    resolveB({
      kind: 'completed',
      data: { clubId: 'club-002', clubName: '电子设计协会', role: 'hr', permissions: ['club:dashboard:view', 'club:member:view-self'], memberId: 'mem-B' },
    })
    await flushPromises()

    expect(workspace.currentClubId).toBe('club-003') // 仍为 C
    expect(workspace.currentMemberId).toBe('mem-C') // 仍为 C 的 memberId,不是 B 的 mem-B
    expect(session.workspace?.clubId).toBe('club-003') // 会话仍为 C
    // 导航只调过一次,落点仍为 C
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith('/org/club-003/dashboard')
    wrapper.unmount()
  })

  it('M-2：快速切换 B→C,B 失败时不得清空已成功写入的 C 上下文', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001')
    const session = seedSession(['platform:club:manage', 'club:dashboard:view'])
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-001' }
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [
        { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
        { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' },
        { clubId: 'club-003', clubName: '摄影协会', role: 'member' },
      ] },
    })
    // B 挂起后失败
    let resolveB!: (v: unknown) => void
    const promiseB = new Promise((r) => { resolveB = r })
    mocks.getContext
      .mockReturnValueOnce(promiseB)
      .mockResolvedValueOnce({
        kind: 'completed',
        data: { clubId: 'club-003', clubName: '摄影协会', role: 'member', permissions: ['club:dashboard:view'], memberId: 'mem-C' },
      })

    const wrapper = await mountSwitcher()
    const itemB = wrapper.findAll('.dd-item').find((i) => i.text().includes('电子设计协会'))!
    const itemC = wrapper.findAll('.dd-item').find((i) => i.text().includes('摄影协会'))!

    const pClickB = itemB.trigger('click')
    const pClickC = itemC.trigger('click')
    await Promise.all([pClickB, pClickC])
    await flushPromises()

    // C 已成功写入
    expect(workspace.currentClubId).toBe('club-003')
    expect(mocks.push).toHaveBeenCalledWith('/org/club-003/dashboard')
    expect(session.workspace?.clubId).toBe('club-003') // 会话已同步为 C

    // B 后失败——其错误响应必须被丢弃,不得清空 C 的有效上下文
    resolveB({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })
    await flushPromises()

    expect(workspace.hasWorkspace).toBe(true)
    expect(workspace.currentClubId).toBe('club-003') // C 不被清空
    expect(workspace.currentMemberId).toBe('mem-C')
    expect(session.workspace?.clubId).toBe('club-003') // 会话仍为 C,不被 B 失败污染
    // 导航只调一次（C 触发），不得因 B 失败再次跳走
    expect(mocks.push).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('M-2：同 clubId 连续点击多次只触发一次 getContext（in-flight 去重）', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001', 'mem-001')
    const session = seedSession()
    session.workspace = { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader', memberId: 'mem-001' }
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [
        { clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' },
        { clubId: 'club-002', clubName: '电子设计协会', role: 'hr' },
      ] },
    })
    // getContext 挂起：让我们能验证多次点击的去重
    let resolveCtx!: (v: unknown) => void
    const promiseCtx = new Promise((r) => { resolveCtx = r })
    mocks.getContext.mockReturnValueOnce(promiseCtx)

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('电子设计协会'))!

    // 连续点击 3 次,模拟用户在切换中反复点击
    const p1 = item.trigger('click')
    const p2 = item.trigger('click')
    const p3 = item.trigger('click')
    await Promise.all([p1, p2, p3])
    await flushPromises()

    // 仅触发一次 getContext（store 层 inFlightByClub 去重）
    expect(mocks.getContext).toHaveBeenCalledTimes(1)

    // 清理：resolve 让 promise 完成,避免污染后续测试
    resolveCtx({
      kind: 'completed',
      data: { clubId: 'club-002', clubName: '电子设计协会', role: 'hr', permissions: ['club:dashboard:view'], memberId: 'mem-B' },
    })
    await flushPromises()
    wrapper.unmount()
  })
})
