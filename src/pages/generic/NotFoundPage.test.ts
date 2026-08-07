import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { mockPush, mockBack } = vi.hoisted(() => ({ mockPush: vi.fn(), mockBack: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))

import NotFoundPage from './NotFoundPage.vue'

describe('NotFoundPage 404 页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染 404 文案与操作按钮', () => {
    const wrapper = mount(NotFoundPage)
    expect(wrapper.text()).toContain('404')
    expect(wrapper.text()).toContain('页面未找到')
    expect(wrapper.text()).toContain('返回上页')
    expect(wrapper.text()).toContain('首页')
  })

  it('点击首页跳转公开目录', async () => {
    const wrapper = mount(NotFoundPage)
    await wrapper.findAll('button').find((b) => b.text().includes('首页'))!.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/explore')
  })

  it('点击返回上页触发 router.back', async () => {
    const wrapper = mount(NotFoundPage)
    await wrapper.findAll('button').find((b) => b.text().includes('返回上页'))!.trigger('click')
    expect(mockBack).toHaveBeenCalled()
  })
})
