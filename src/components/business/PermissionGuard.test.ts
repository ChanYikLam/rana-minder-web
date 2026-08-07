import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import PermissionGuard from './PermissionGuard.vue'
import type { User } from '@/types/domain'

function seedSession(permissions: string[]) {
  const session = useSessionViewStore()
  session.user = { id: 'u1' } as User
  session.permissions = permissions
}

describe('PermissionGuard 权限守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('有权限：渲染内容', () => {
    seedSession(['club:member:manage'])
    const wrapper = mount(PermissionGuard, {
      props: { permission: 'club:member:manage' },
      slots: { default: '<p class="secret">敏感按钮</p>' },
    })
    expect(wrapper.find('.secret').exists()).toBe(true)
  })

  it('无权限：不渲染内容', () => {
    seedSession([])
    const wrapper = mount(PermissionGuard, {
      props: { permission: 'club:member:manage' },
      slots: { default: '<p class="secret">敏感按钮</p>' },
    })
    expect(wrapper.find('.secret').exists()).toBe(false)
  })

  it('workspace 作用域：按当前社团权限判定', () => {
    seedSession([])
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'hr', ['club:export:execute'], 'u1')
    const wrapper = mount(PermissionGuard, {
      props: { permission: 'club:export:execute', scope: 'workspace' },
      slots: { default: '<p class="secret">导出</p>' },
    })
    expect(wrapper.find('.secret').exists()).toBe(true)
  })
})
