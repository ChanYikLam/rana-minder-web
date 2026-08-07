import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ErrorState from './ErrorState.vue'
import { pageStubs } from '@/test-utils/pageStubs'

describe('ErrorState 错误态', () => {
  it('渲染默认标题与消息', () => {
    const wrapper = mount(ErrorState, { global: { stubs: pageStubs } })
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.text()).toContain('加载失败')
    expect(wrapper.text()).toContain('数据加载失败，请稍后重试或刷新页面。')
  })

  it('自定义标题/消息与重试', async () => {
    const wrapper = mount(ErrorState, { props: { title: '网络异常', message: '请检查网络' }, global: { stubs: pageStubs } })
    expect(wrapper.text()).toContain('网络异常')
    expect(wrapper.text()).toContain('请检查网络')
    await wrapper.findAll('button').find((b) => b.text().includes('重试'))!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
