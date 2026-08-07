import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationDetail from './NotificationDetail.vue'

const notification = {
  id: 'n1', type: 'application', title: '报名状态更新', body: '你的报名已通过',
  read: false, createdAt: '2026-08-01T04:00:00Z', link: '/me/ongoing', clubName: '计算机协会',
}

describe('NotificationDetail 通知详情', () => {
  it('渲染标题、正文与返回', async () => {
    const wrapper = mount(NotificationDetail, { props: { notification } })
    expect(wrapper.text()).toContain('报名状态更新')
    expect(wrapper.text()).toContain('你的报名已通过')
    expect(wrapper.text()).toContain('计算机协会')
    await wrapper.findAll('button').find((b) => b.text().includes('返回'))!.trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('正文为空：标题与来源仍渲染', () => {
    const wrapper = mount(NotificationDetail, { props: { notification: { ...notification, body: '' } } })
    expect(wrapper.text()).toContain('报名状态更新')
    expect(wrapper.text()).toContain('计算机协会')
    wrapper.unmount()
  })
})
