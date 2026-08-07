import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import ConfirmScope from './ConfirmScope.vue'

describe('ConfirmScope 影响范围确认', () => {
  it('打开且无目标：确认不可用', () => {
    const wrapper = mount(ConfirmScope, {
      props: { open: true, targets: [], confirmLabel: '确认执行' },
      global: { stubs: pageStubs },
    })
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认执行'))!
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('有目标：展示目标并确认 emit', async () => {
    const wrapper = mount(ConfirmScope, {
      props: { open: true, targets: [{ id: 't1', label: '社团 A' }], confirmLabel: '确认执行' },
      global: { stubs: pageStubs },
    })
    expect(wrapper.text()).toContain('社团 A')
    await wrapper.findAll('button').find((b) => b.text().includes('确认执行'))!.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('取消：emit cancel', async () => {
    const wrapper = mount(ConfirmScope, {
      props: { open: true, targets: [{ id: 't1', label: '社团 A' }], cancelLabel: '取消' },
      global: { stubs: pageStubs },
    })
    await wrapper.findAll('button').find((b) => b.text().includes('取消'))!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
