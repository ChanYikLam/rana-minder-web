import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Banner from './Banner.vue'

describe('Banner 提示条', () => {
  it('默认 info 色调渲染标题与消息', () => {
    const wrapper = mount(Banner, { props: { title: '提示', message: '详情' } })
    expect(wrapper.text()).toContain('提示')
    expect(wrapper.text()).toContain('详情')
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('success/warning/danger 色调类', () => {
    expect(mount(Banner, { props: { tone: 'success', title: 'ok' } }).html()).toContain('bg-success-subtle')
    expect(mount(Banner, { props: { tone: 'warning', title: 'warn' } }).html()).toContain('bg-warning-subtle')
    expect(mount(Banner, { props: { tone: 'danger', title: 'err' } }).html()).toContain('bg-danger-subtle')
  })

  it('closable：点击关闭并 emit close', async () => {
    const wrapper = mount(Banner, { props: { title: 'x', closable: true } })
    expect(wrapper.text()).toContain('x')
    await wrapper.find('button[aria-label="关闭提示"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('x')
  })
})
