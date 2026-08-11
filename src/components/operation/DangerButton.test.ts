import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DangerButton from './DangerButton.vue'
import { pageStubs } from '@/test-utils/pageStubs'

describe('DangerButton 危险操作按钮', () => {
  it('无确认标题：默认确认文案，拒绝时不 emit（P2-4）', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const wrapper = mount(DangerButton, { props: { label: '删除' }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('删除'))!.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('无确认标题：确认通过时 emit', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = mount(DangerButton, { props: { label: '删除' }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('删除'))!.trigger('click')
    expect(confirmSpy).toHaveBeenCalledWith('确认要执行「执行危险操作」吗？')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('disabled：不 emit', async () => {
    const wrapper = mount(DangerButton, { props: { label: '删除', disabled: true }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('删除'))!.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('带确认标题：window.confirm 拒绝时不 emit', async () => {
    // happy-dom 无 window.confirm，用 stub 提供
    vi.stubGlobal('confirm', vi.fn(() => false))
    const wrapper = mount(DangerButton, { props: { label: '删除', confirmTitle: '确认删除' }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('删除'))!.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('带确认标题：confirm 通过时 emit', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = mount(DangerButton, { props: { label: '删除', confirmTitle: '确认删除', confirmDescription: '不可撤销' }, global: { stubs: pageStubs } })
    await wrapper.findAll('button').find((b) => b.text().includes('删除'))!.trigger('click')
    expect(confirmSpy).toHaveBeenCalledWith('不可撤销')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    vi.unstubAllGlobals()
  })
})
