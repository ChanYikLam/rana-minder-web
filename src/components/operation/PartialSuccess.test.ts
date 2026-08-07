import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import PartialSuccess from './PartialSuccess.vue'

describe('PartialSuccess 部分成功结果', () => {
  it('全部成功：不展示失败与重试', () => {
    const wrapper = mount(PartialSuccess, {
      props: { results: [{ id: 'a', label: '社团 A', success: true, message: '完成' }] },
      global: { stubs: pageStubs },
    })
    expect(wrapper.text()).toContain('社团 A')
    expect(wrapper.text()).not.toContain('重试')
  })

  it('部分失败：展示失败项与重试按钮', async () => {
    const wrapper = mount(PartialSuccess, {
      props: {
        results: [
          { id: 'a', label: '社团 A', success: true, message: '完成' },
          { id: 'b', label: '社团 B', success: false, message: '超时' },
        ],
      },
      global: { stubs: pageStubs },
    })
    expect(wrapper.text()).toContain('超时')
    await wrapper.findAll('button').find((b) => b.text().includes('重试'))!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
