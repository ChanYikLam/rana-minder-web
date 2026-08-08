import { beforeEach, describe, expect, it } from 'vitest'

import {
  pushNotifications,
  pushNotification,
  listNotifications,
  unreadCountOf,
  markNotificationRead,
  markAllNotificationsRead,
  userIdOfApplicant,
  renderNotificationTemplate,
  notificationTemplates,
  setNotificationPreference,
  listNotificationPreferences,
  setNotificationKillSwitch,
  notificationKillSwitch,
  clubKillSwitchState,
  clubKillSwitches,
  emailOutbox,
} from './notifications'
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

describe('P1-009 通知模板目录（NTF）', () => {
  it('模板目录覆盖全部业务类型（application/interview/invitation/conclusion/system/member/transition/correction/label_override/overall_not_admitted）', () => {
    const kinds = Object.keys(notificationTemplates)
    expect(kinds).toEqual(['application', 'interview', 'invitation', 'conclusion', 'system', 'member', 'transition', 'correction', 'label_override', 'overall_not_admitted'])
    for (const tpl of Object.values(notificationTemplates)) {
      expect(tpl.title.length).toBeGreaterThan(0)
      expect(tpl.channel.length).toBeGreaterThan(0)
    }
  })

  it('模板渲染：变量插值 + HTML 转义（防注入 US-NTF-02）', () => {
    const r = renderNotificationTemplate('application', {
      activityTitle: '<script>alert(1)</script>计算机协会招新',
    })
    expect(r.title).toBe('报名申请已提交')
    expect(r.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(r.body).not.toContain('<script>')
    expect(r.link).toBe('/me/todo')
  })

  it('邀请模板声明站内信+邮件双渠道，且渲染邮件字段', () => {
    const r = renderNotificationTemplate('invitation', { clubName: '计算机协会', dedupRef: 'invite:rinv-x' })
    expect(r.channel).toEqual(['inbox', 'email'])
    expect(r.emailSubject).toBe('【RanaMinder】收到录取邀请')
    expect(r.emailBody).toContain('计算机协会')
    expect(r.dedupKey).toBe('invite:rinv-x')
  })
})

describe('P1-009 去重（US-NTF-01）', () => {
  it('同事件对象时间窗内重复推送被丢弃', () => {
    const first = pushNotification(['ntf-test-user'], 'application', {
      activityTitle: '计算机协会招新', dedupRef: 'apply:act-001:u-001',
    })
    expect(first.delivered).toBe(1)
    expect(first.dropped).toBe(0)

    const dup = pushNotification(['ntf-test-user'], 'application', {
      activityTitle: '计算机协会招新', dedupRef: 'apply:act-001:u-001',
    })
    expect(dup.delivered).toBe(0)
    expect(dup.dropped).toBe(1)
    expect(dup.reason).toBe('dedup')
    expect(listNotifications('ntf-test-user', false).length).toBe(1)
  })

  it('不同事件对象不被去重（各自落库）', () => {
    pushNotification(['ntf-test-user'], 'application', { activityTitle: 'A', dedupRef: 'apply:act-001:u-001' })
    pushNotification(['ntf-test-user'], 'application', { activityTitle: 'B', dedupRef: 'apply:act-002:u-001' })
    expect(listNotifications('ntf-test-user', false).length).toBe(2)
  })
})

describe('P1-009 紧急关闭 kill switch（US-NTF-01）', () => {
  it('平台级熔断：开启后所有通知被丢弃并计数', () => {
    setNotificationKillSwitch({ active: true, scope: 'platform', reason: '系统维护', operatorName: '平台管理员' })
    expect(notificationKillSwitch.active).toBe(true)

    const r = pushNotification(['ntf-test-user'], 'application', { activityTitle: 'A', dedupRef: 'apply:act-001:u-001' }, { clubId: 'club-001' })
    expect(r.delivered).toBe(0)
    expect(r.dropped).toBe(1)
    expect(r.reason).toBe('killswitch')
    expect(notificationKillSwitch.droppedCount).toBe(1)
    expect(listNotifications('ntf-test-user', false).length).toBe(0)

    setNotificationKillSwitch({ active: false })
    const ok = pushNotification(['ntf-test-user'], 'application', { activityTitle: 'A', dedupRef: 'apply:act-001:u-001' }, { clubId: 'club-001' })
    expect(ok.delivered).toBe(1)
  })

  it('社团级熔断仅命中该社团，其他社团不受影响', () => {
    setNotificationKillSwitch({ active: true, scope: 'club', clubId: 'club-001', reason: '社团故障' })

    const blocked = pushNotification(['ntf-test-user'], 'application', { activityTitle: 'A', dedupRef: 'apply:act-001:u-001' }, { clubId: 'club-001' })
    expect(blocked.dropped).toBe(1)

    const passed = pushNotification(['ntf-test-user'], 'application', { activityTitle: 'B', dedupRef: 'apply:act-002:u-001' }, { clubId: 'club-002' })
    expect(passed.delivered).toBe(1)
  })

  it('多社团熔断状态互相隔离：互不覆盖、互不串读、互不影响开关', () => {
    setNotificationKillSwitch({ active: true, scope: 'club', clubId: 'club-001', reason: '社团A故障' })
    setNotificationKillSwitch({ active: true, scope: 'club', clubId: 'club-002', reason: '社团B故障' })

    // 各自独立开启，互不覆盖
    expect(clubKillSwitchState('club-001').active).toBe(true)
    expect(clubKillSwitchState('club-002').active).toBe(true)
    expect(clubKillSwitchState('club-001').reason).toBe('社团A故障')

    // 关闭 club-002 不影响 club-001
    setNotificationKillSwitch({ active: false, scope: 'club', clubId: 'club-002' })
    expect(clubKillSwitchState('club-002').active).toBe(false)
    expect(clubKillSwitchState('club-001').active).toBe(true)
    expect(clubKillSwitches.size).toBe(2)

    // 无记录的社团不熔断
    expect(clubKillSwitchState('club-999').active).toBe(false)
  })

  it('社团级熔断计数计入对应社团 droppedCount（可审计）', () => {
    setNotificationKillSwitch({ active: true, scope: 'club', clubId: 'club-001', reason: '社团故障' })
    pushNotification(['ntf-test-user'], 'application', { activityTitle: 'A', dedupRef: 'apply:act-001:u-001' }, { clubId: 'club-001' })
    pushNotification(['ntf-test-user'], 'application', { activityTitle: 'B', dedupRef: 'apply:act-002:u-001' }, { clubId: 'club-001' })
    expect(clubKillSwitchState('club-001').droppedCount).toBe(2)
    // 平台级计数不受社团熔断影响
    expect(notificationKillSwitch.droppedCount).toBe(0)
  })
})

describe('P1-009 通知偏好（US-NTF-01）', () => {
  it('缺省全部订阅，退订后不再收到对应类型', () => {
    expect(listNotificationPreferences('ntf-test-user').application).toBe(true)

    setNotificationPreference('ntf-test-user', 'application', false)
    expect(listNotificationPreferences('ntf-test-user').application).toBe(false)

    const r = pushNotification(['ntf-test-user'], 'application', { activityTitle: 'A', dedupRef: 'apply:act-001:u-001' })
    expect(r.delivered).toBe(0)
    expect(r.dropped).toBe(1)
    expect(r.reason).toBe('unsubscribed')

    // 其他类型不受影响
    const ok = pushNotification(['ntf-test-user'], 'interview', { body: '面试已排期', dedupRef: 'book:act-001:u-001' }, { title: '面试已排期', body: '您的面试已安排' })
    expect(ok.delivered).toBe(1)
  })
})

describe('P1-009 邮件渠道（US-NTF-02）', () => {
  it('模板声明 email 渠道且用户有邮箱时产生邮件 outbox 记录', () => {
    const r = pushNotification(['applicant2'], 'invitation', {
      clubName: '计算机协会', dedupRef: 'invite:rinv-100',
    })
    expect(r.delivered).toBe(1)
    const email = emailOutbox[0]
    expect(email).toBeDefined()
    expect(email.toUserId).toBe('applicant2')
    expect(email.toEmail).toBe('applicant2@example.edu.cn')
    expect(email.subject).toBe('【RanaMinder】收到录取邀请')
  })

  it('纯内部通知（channel 覆盖为 inbox）不产生邮件', () => {
    pushNotification(['applicant2'], 'conclusion', { dedupRef: 'review:jnt-001:u-002' }, { channel: ['inbox'], title: '结论被修改', body: '您的结论已被复核修改' })
    expect(emailOutbox.length).toBe(0)
  })

  it('业务侧传入真实用户 id（user-applicant-002）也能匹配邮箱产生邮件', () => {
    pushNotification(['user-applicant-002'], 'invitation', { clubName: '计算机协会', dedupRef: 'invite:rinv-101' })
    const email = emailOutbox[0]
    expect(email).toBeDefined()
    expect(email.toUserId).toBe('user-applicant-002')
    expect(email.toEmail).toBe('applicant2@example.edu.cn')
    expect(email.subject).toBe('【RanaMinder】收到录取邀请')
  })
})
