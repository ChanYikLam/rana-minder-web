import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProcessingTag from './ProcessingTag.vue'

describe('ProcessingTag 处理状态标签', () => {
  it('默认以 status 为文案', () => {
    const wrapper = mount(ProcessingTag, { props: { status: 'checking' } })
    expect(wrapper.text()).toContain('checking')
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('自定义 label 优先', () => {
    const wrapper = mount(ProcessingTag, { props: { status: 'checking', label: '安全检查中' } })
    expect(wrapper.text()).toContain('安全检查中')
  })

  it('approved/failed 色调区分', () => {
    expect(mount(ProcessingTag, { props: { status: 'approved' } }).html()).toContain('bg-success-subtle')
    expect(mount(ProcessingTag, { props: { status: 'failed' } }).html()).toContain('bg-danger-subtle')
  })

  it('进行中状态带旋转动画类', () => {
    expect(mount(ProcessingTag, { props: { status: 'generating' } }).html()).toContain('animate-spin')
    expect(mount(ProcessingTag, { props: { status: 'approved' } }).html()).not.toContain('animate-spin')
  })
})
