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
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: { template: '<div class="dd"><slot /></div>' },
  DropdownMenuTrigger: { template: '<div class="dd-trigger"><slot /></div>' },
  DropdownMenuContent: { template: '<div class="dd-content"><slot /></div>' },
  DropdownMenuItem: { template: '<button type="button" class="dd-item" @click="$emit(\'click\')"><slot /></button>' },
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
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '网络协会', role: 'hr' }] },
    })

    const wrapper = await mountSwitcher()

    expect(mocks.getMyClubs).toHaveBeenCalledTimes(1)
    const items = wrapper.findAll('.dd-item')
    expect(items.some((i) => i.text().includes('网络协会'))).toBe(true)
  })

  it('切换成功：同步会话工作空间与权限并跳转新社团看板', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001', 'mem-001')
    const session = seedSession(['platform:club:manage', 'club:dashboard:view'])
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '网络协会', role: 'hr' }] },
    })
    // 新社团上下文：无成员身份（memberId=null），权限为社团级视图权限
    mocks.getContext.mockResolvedValue({
      kind: 'completed',
      data: { clubId: 'club-002', clubName: '网络协会', role: 'hr', permissions: ['club:member:view-self'], memberId: null },
    })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('网络协会'))!
    await item.trigger('click')
    await flushPromises()

    expect(mocks.getContext).toHaveBeenCalledWith('club-002')
    // 会话工作空间同步为新社团上下文；memberId 不得沿用 club-001 的 mem-001（防串身份）
    expect(session.workspace).toEqual({
      clubId: 'club-002',
      clubName: '网络协会',
      role: 'hr',
      memberId: undefined,
    })
    // 权限合并：保留 platform:*，仅以新社团权限覆盖 club:* 域
    expect(session.permissions).toEqual(['platform:club:manage', 'club:member:view-self'])
    expect(mocks.push).toHaveBeenCalledWith('/org/club-002/dashboard')
  })

  it('切换成功：新社团有成员身份时写入新 memberId', async () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', ['club:dashboard:view'], 'user-001', 'mem-001')
    const session = seedSession()
    mocks.getMyClubs.mockResolvedValue({
      kind: 'completed',
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '网络协会', role: 'member' }] },
    })
    mocks.getContext.mockResolvedValue({
      kind: 'completed',
      data: { clubId: 'club-002', clubName: '网络协会', role: 'member', permissions: [], memberId: 'mem-020' },
    })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('网络协会'))!
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
      data: { clubs: [{ clubId: 'club-001', clubName: '计算机协会', role: 'club_leader' }, { clubId: 'club-002', clubName: '网络协会', role: 'hr' }] },
    })
    mocks.getContext.mockResolvedValue({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: 'x' } })

    const wrapper = await mountSwitcher()
    const item = wrapper.findAll('.dd-item').find((i) => i.text().includes('网络协会'))!
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

    expect(wrapper.text()).toContain('暂无加入的社团')
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
})
