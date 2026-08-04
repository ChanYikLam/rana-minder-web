import { mockUsers, USER_MEMBER_MAP, USER_APPLICANT_MAP } from './auth'

/** 站内信（mock 内存态；业务操作经 push* 动态生成，已读状态真实落库） */
export interface SysNotification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
  link: string | null
}

export interface NotificationPayload {
  type: string
  title: string
  body: string
  link?: string | null
}

let notificationSeq = 1000

function nextNotificationId(): string {
  notificationSeq += 1
  return 'ntf-' + notificationSeq
}

const now = (): string => new Date().toISOString()

/** 初始站内信种子（动态业务操作未发生时展示） */
export const sysNotifications: SysNotification[] = [
  { id: 'ntf-001', userId: 'user-applicant-002', type: 'application', title: '报名申请已提交', body: '您的报名申请已提交，请等待审核。', read: false, createdAt: '2025-08-01T10:00:00+08:00', link: '/me/todo' },
  { id: 'ntf-002', userId: 'user-applicant-002', type: 'interview', title: '面试已排期', body: '您的面试已安排，请查看日程。', read: false, createdAt: '2025-08-01T09:00:00+08:00', link: '/me/schedule' },
  { id: 'ntf-003', userId: 'user-applicant-002', type: 'invitation', title: '收到录取邀请', body: '恭喜！您已收到录取邀请，请及时确认。', read: false, createdAt: '2025-07-31T14:00:00+08:00', link: '/me/invitations/recruitment/rinv-001' },
  { id: 'ntf-004', userId: 'user-member-001', type: 'system', title: '系统维护通知', body: '系统将于本周六凌晨进行维护。', read: true, createdAt: '2025-07-30T18:00:00+08:00', link: null },
]

/** 向一批用户推送站内信（同一时刻进入列表顶部） */
export function pushNotifications(userIds: string[], payload: NotificationPayload): void {
  const createdAt = now()
  for (const userId of userIds) {
    sysNotifications.unshift({
      id: nextNotificationId(),
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      read: false,
      createdAt,
      link: payload.link ?? null,
    })
  }
}

/** 申请人 id（u-xxx）→ 可接收通知的前端用户 id */
export function userIdOfApplicant(applicantId: string): string | null {
  for (const [userId, applicant] of Object.entries(USER_APPLICANT_MAP)) {
    if (applicant === applicantId) return userId
  }
  return null
}

/** 成员 id（mem-xxx）→ 可接收通知的前端用户 id（原文被告知亦可能是申请人之类的非成员，若不存在返回 null） */
export function userIdOfMember(memberId: string): string | null {
  for (const [userId, member] of Object.entries(USER_MEMBER_MAP)) {
    if (member === memberId) return userId
  }
  return null
}

/** 按展示姓名反查可接收通知的前端用户 id（通知「原设置者」用） */
export function userIdOfName(name: string): string | null {
  if (!name) return null
  for (const user of Object.values(mockUsers)) {
    if (user.name === name) return user.id
  }
  return null
}

export function listNotifications(userId: string, unreadOnly: boolean): SysNotification[] {
  const items = sysNotifications.filter((n) => n.userId === userId)
  return unreadOnly ? items.filter((n) => !n.read) : items
}

export function unreadCountOf(userId: string): number {
  return sysNotifications.filter((n) => n.userId === userId && !n.read).length
}

export function markNotificationRead(userId: string, id: string): void {
  const n = sysNotifications.find((x) => x.id === id && x.userId === userId)
  if (n) n.read = true
}

export function markAllNotificationsRead(userId: string): void {
  for (const n of sysNotifications) {
    if (n.userId === userId) n.read = true
  }
}

// ================= 测试隔离：恢复初始种子 =================

const seedSysNotifications = structuredClone(sysNotifications)
const seedNotificationSeq = notificationSeq

/** 恢复站内信 mock 域到初始种子态（供测试隔离：每个用例回到种子起点） */
export function resetNotifications(): void {
  sysNotifications.splice(0, sysNotifications.length, ...structuredClone(seedSysNotifications))
  notificationSeq = seedNotificationSeq
}