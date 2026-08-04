import { beforeEach, describe, expect, it } from 'vitest'

import { pushNotifications, listNotifications, unreadCountOf, markNotificationRead, markAllNotificationsRead, userIdOfApplicant } from './notifications'
import { resetNotifications } from './reset'

beforeEach(() => {
  resetNotifications()
})

describe('通知动态化（P1-B5/B6）', () => {
  it('列表按当前用户隔离，种子数据归属正确', () => {
    const mine = listNotifications('user-applicant-002', false)
    expect(mine.length).toBe(3)
    expect(mine.every((n) => n.userId === 'user-applicant-002')).toBe(true)
    const member = listNotifications('user-member-001', false)
    expect(member.length).toBe(1)
    expect(member[0]?.type).toBe('system')
  })

  it('pushNotifications 直接入未读列表顶部并可过滤', () => {
    pushNotifications(['ntf-test-user'], { type: 'conclusion', title: '结论已发布', body: '请查看最终结果。', link: '/me/todo' })
    const all = listNotifications('ntf-test-user', false)
    expect(all.length).toBe(1)
    expect(unreadCountOf('ntf-test-user')).toBe(1)
    const unread = listNotifications('ntf-test-user', true)
    expect(unread[0]?.title).toBe('结论已发布')
    expect(unread[0]?.read).toBe(false)
  })

  it('已读单条与全部已读真实落状态', () => {
    pushNotifications(['ntf-test-user'], { type: 'conclusion', title: '结论已发布', body: '请查看最终结果。', link: '/me/todo' })
    pushNotifications(['ntf-test-user'], { type: 'interview', title: '面试已排期', body: '面试已安排。', link: '/me/schedule' })
    expect(unreadCountOf('ntf-test-user')).toBe(2)
    markNotificationRead('ntf-test-user', listNotifications('ntf-test-user', false)[0]!.id)
    expect(unreadCountOf('ntf-test-user')).toBe(1)
    markAllNotificationsRead('ntf-test-user')
    expect(unreadCountOf('ntf-test-user')).toBe(0)
    expect(listNotifications('ntf-test-user', true).length).toBe(0)
  })

  it('申请人 id 反查可接收通知的用户', () => {
    expect(userIdOfApplicant('u-002')).toBe('user-applicant-002')
    expect(userIdOfApplicant('u-999')).toBeNull()
  })
})