import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import WithdrawAction from './WithdrawAction.vue'

describe('WithdrawAction 两段式撤回', () => {
  it('点击撤回进入确认态，确认后 emit', async () => {
    const wrapper = mount(WithdrawAction, { props: { label: '撤回' }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('撤回'))!.trigger('click')
    expect(wrapper.text()).toContain('确定要撤回该操作吗？')
    await wrapper.findAll('button').find((b) => b.text().includes('确认撤回'))!.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('取消不 emit', async () => {
    const wrapper = mount(WithdrawAction, { props: { label: '撤回' }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('撤回'))!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('取消'))!.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('disabled 时不可进入确认态', async () => {
    const wrapper = mount(WithdrawAction, { props: { label: '撤回', disabled: true }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('撤回'))!.trigger('click')
    expect(wrapper.text()).not.toContain('确认撤回')
  })
})
