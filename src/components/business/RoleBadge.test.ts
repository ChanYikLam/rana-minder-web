import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import RoleBadge from './RoleBadge.vue'

const statusStub = {
  StatusBadge: { props: ['variant', 'label'], template: '<span class="badge" :data-variant="variant">{{ label }}</span>' },
}

describe('RoleBadge 角色徽章', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('有工作空间：渲染角色与社团名', () => {
    const workspace = useWorkspaceContextStore()
    workspace.setWorkspace('club-001', '计算机协会', 'club_leader', [], 'u1')
    const wrapper = mount(RoleBadge, { global: { stubs: statusStub } })
    expect(wrapper.text()).toContain('社团负责人')
    expect(wrapper.text()).toContain('计算机协会')
  })

  it('无工作空间：不渲染徽章', () => {
    const wrapper = mount(RoleBadge, { global: { stubs: statusStub } })
    expect(wrapper.find('.badge').exists()).toBe(false)
  })
})
