import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PageStateBoundary from './PageStateBoundary.vue'

function mountBoundary(props: Record<string, unknown> = {}) {
  return mount(PageStateBoundary, {
    props: { state: 'normal', title: '测试页', ...props },
    slots: { default: '<p class="content-marker">内容区</p>' },
    global: { stubs: { Loader2: { template: '<i />' }, AlertTriangle: { template: '<i />' }, Lock: { template: '<i />' }, Inbox: { template: '<i />' } } },
  })
}

describe('PageStateBoundary 页面状态边界', () => {
  it('normal：渲染内容区', () => {
    const wrapper = mountBoundary()
    expect(wrapper.text()).toContain('内容区')
  })

  it('loading：渲染加载态且不渲染内容', () => {
    const wrapper = mountBoundary({ state: 'loading' })
    expect(wrapper.text()).toContain('加载中...')
    expect(wrapper.text()).not.toContain('内容区')
  })

  it('empty：渲染空态标题与描述，可触发空态动作', async () => {
    const wrapper = mountBoundary({ state: 'empty', emptyTitle: '暂无申请', emptyDescription: '点击创建', emptyActionLabel: '创建申请' })
    expect(wrapper.text()).toContain('暂无申请')
    expect(wrapper.text()).toContain('点击创建')
    await wrapper.findAll('button').find((b) => b.text().includes('创建申请'))!.trigger('click')
    expect(wrapper.emitted('emptyAction')).toHaveLength(1)
  })

  it('error：渲染错误信息与支持编号，可重试', async () => {
    const wrapper = mountBoundary({
      state: 'error',
      errorMessage: '网络异常',
      supportId: 'SUP-9',
      error: { code: 'IFC-ERR-016', message: 'x' },
    })
    expect(wrapper.text()).toContain('操作失败')
    expect(wrapper.text()).toContain('网络异常')
    expect(wrapper.text()).toContain('支持编号：SUP-9')
    await wrapper.findAll('button').find((b) => b.text().includes('重试'))!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('error：无 errorMessage 时回退 error.message', () => {
    const wrapper = mountBoundary({ state: 'error', error: { code: 'IFC-ERR-005', message: '校验失败' } })
    expect(wrapper.text()).toContain('校验失败')
  })

  it('forbidden：渲染无权限提示', () => {
    const wrapper = mountBoundary({ state: 'forbidden' })
    expect(wrapper.text()).toContain('无权限访问')
    expect(wrapper.text()).toContain('您没有访问此页面的权限')
    expect(wrapper.text()).not.toContain('内容区')
  })
})
