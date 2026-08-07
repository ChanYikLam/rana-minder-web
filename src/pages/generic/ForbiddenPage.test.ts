import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { mockPush, mockBack } = vi.hoisted(() => ({ mockPush: vi.fn(), mockBack: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))

import ForbiddenPage from './ForbiddenPage.vue'

describe('ForbiddenPage 无权限页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染无权限文案与操作按钮', () => {
    const wrapper = mount(ForbiddenPage)
    expect(wrapper.text()).toContain('无权限访问')
    expect(wrapper.text()).toContain('您没有访问此页面的权限')
    expect(wrapper.text()).toContain('个人中心')
  })

  it('点击个人中心跳转 /me', async () => {
    const wrapper = mount(ForbiddenPage)
    await wrapper.findAll('button').find((b) => b.text().includes('个人中心'))!.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/me')
  })

  it('点击返回上页触发 router.back', async () => {
    const wrapper = mount(ForbiddenPage)
    await wrapper.findAll('button').find((b) => b.text().includes('返回上页'))!.trigger('click')
    expect(mockBack).toHaveBeenCalled()
  })
})
