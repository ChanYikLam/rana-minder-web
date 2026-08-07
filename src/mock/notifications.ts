import { mockUsers, USER_APPLICANT_MAP, type MockUser } from './auth'
import { applicantStudentIdOf } from './db-recruitment'
import { MEMBER_BY_USER } from './db'

/** =================================================================================
 * 通知中心（NTF 机制，P1-009）
 *
 * 原有实现仅提供「站内信 + 硬编码文案」的 pushNotifications，业务操作处散落 10 处
 * 字符串拼接，缺少：模板中心、邮件渠道、紧急关闭（kill switch）、去重、偏好订阅。
 *
 * 本模块扩展为统一通知中心：
 *  - notificationTemplates：通知模板目录（站内信 + 可选邮件，变量插值 + HTML 转义）
 *  - pushNotification()：唯一入站口 —— 渲染模板 → 偏好过滤 → 去重 → 紧急关闭熔断 → 落库
 *  - notificationKillSwitch：平台/社团级紧急关闭（熔断后入站口直接丢弃并计数）
 *  - notificationDedup：同事件对象（user+kind+dedupRef）时间窗内去重
 *  - notificationPreferences：用户按事件类型订阅/退订
 *  - emailOutbox：模拟邮件发送事实（站内信之外的可追踪邮件通道）
 *  - emailConfigs：SMTP 配置按作用域存储，「保存强制测试通过」（US-NTF-02）
 * ================================================================================= */

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
  clubName: string | null
}

/** 通知业务类型（与页面 TYPE_LABELS 对齐 + 邮件/纠错/成员） */
export type NotificationKind =
  | 'application'
  | 'interview'
  | 'invitation'
  | 'conclusion'
  | 'system'
  | 'member'
  | 'transition'
  | 'correction'

/** 发送渠道：inbox=仅站内信（纯内部通知）；email=额外发邮件 */
export type NotificationChannel = 'inbox' | 'email'

/** 通知模板（NTF 目录：业务只声明「事件类型+变量」，文案/渠道/去重键由模板中心裁决） */
export interface NotificationTemplate {
  kind: NotificationKind
  /** 站内信标题模板（{{var}} 占位符） */
  title: string
  /** 站内信正文模板 */
  body: string
  /** 邮件主题模板（缺省 = 站内信标题） */
  emailSubject?: string
  /** 邮件正文模板（缺省 = 站内信正文） */
  emailBody?: string
  /** 发送渠道：['inbox'] = 纯内部通知仅站内信；['inbox','email'] = 站内信+邮件 */
  channel: NotificationChannel[]
  /** 默认跳转链接模板（可被调用方覆盖） */
  link?: string | null
  /** 去重键模板（同事件对象去重用，如活动+申请人；缺省不做去重） */
  dedupKey?: string | null
}

/** 通知模板目录（P1-009：集中管理，替换业务处散落的硬编码文案） */
export const notificationTemplates: Record<NotificationKind, NotificationTemplate> = {
  application: {
    kind: 'application',
    title: '报名申请已提交',
    body: '您的报名申请已提交，请等待「{{activityTitle}}」的审核。',
    channel: ['inbox'],
    link: '/me/todo',
    dedupKey: '{{dedupRef}}',
  },
  interview: {
    kind: 'interview',
    title: '面试通知',
    body: '{{body}}',
    channel: ['inbox'],
    link: '{{link}}',
    dedupKey: '{{dedupRef}}',
  },
  invitation: {
    kind: 'invitation',
    title: '收到录取邀请',
    body: '恭喜！您已收到「{{clubName}}」的录取邀请，请在有效期内及时确认。',
    channel: ['inbox', 'email'],
    emailSubject: '【RanaMinder】收到录取邀请',
    emailBody: '恭喜！您已收到「{{clubName}}」的录取邀请，请在有效期内及时确认。',
    link: '{{link}}',
    dedupKey: '{{dedupRef}}',
  },
  conclusion: {
    kind: 'conclusion',
    title: '结论已发布',
    body: '您在本轮招新的结论已发布，请前往查看最终结果。',
    channel: ['inbox', 'email'],
    emailSubject: '【RanaMinder】招新结论已发布',
    emailBody: '您在本轮招新的结论已发布，请前往查看最终结果。',
    link: '/me/todo',
    dedupKey: '{{dedupRef}}',
  },
  system: {
    kind: 'system',
    title: '系统通知',
    body: '{{body}}',
    channel: ['inbox'],
    link: null,
  },
  member: {
    kind: 'member',
    title: '成员通知',
    body: '{{body}}',
    channel: ['inbox', 'email'],
    emailSubject: '【RanaMinder】成员通知',
    emailBody: '{{body}}',
    link: null,
  },
  transition: {
    kind: 'transition',
    title: '换届通知',
    body: '{{body}}',
    channel: ['inbox'],
    link: null,
  },
  correction: {
    kind: 'correction',
    title: '纠错通知',
    body: '{{body}}',
    channel: ['inbox'],
    link: null,
  },
}

export interface NotificationPayload {
  type: string
  title: string
  body: string
  link?: string | null
  clubName?: string | null
}

/** 模板渲染变量（调用方传入；模板缺省值兜底） */
export interface NotificationVars {
  [key: string]: string | number | null | undefined
}

export const notificationSeqBase = 1000

let notificationSeq = notificationSeqBase

function nextNotificationId(): string {
  notificationSeq += 1
  return 'ntf-' + notificationSeq
}

const now = (): string => new Date().toISOString()

/** 初始站内信种子（动态业务操作未发生时展示） */
export const sysNotifications: SysNotification[] = [
  { id: 'ntf-001', userId: 'user-applicant-002', type: 'application', title: '报名申请已提交', body: '您的报名申请已提交，请等待审核。', read: false, createdAt: '2025-08-01T10:00:00+08:00', link: '/me/todo', clubName: '计算机协会' },
  { id: 'ntf-002', userId: 'user-applicant-002', type: 'interview', title: '面试已排期', body: '您的面试已安排，请查看日程。', read: false, createdAt: '2025-08-01T09:00:00+08:00', link: '/me/schedule', clubName: '计算机协会' },
  { id: 'ntf-003', userId: 'user-applicant-002', type: 'invitation', title: '收到录取邀请', body: '恭喜！您已收到录取邀请，请及时确认。', read: false, createdAt: '2025-07-31T14:00:00+08:00', link: '/me/invitations/recruitment/rinv-001', clubName: '计算机协会' },
  { id: 'ntf-004', userId: 'user-member-001', type: 'system', title: '系统维护通知', body: '系统将于本周六凌晨进行维护。', read: true, createdAt: '2025-07-30T18:00:00+08:00', link: null, clubName: null },
]

/** =================================================================================
 * 紧急关闭（kill switch，US-NTF-01）
 *  - 平台级：scope='platform'，全站熔断
 *  - 社团级：scope='club' + clubId，仅熔断该社团触发的通知
 *  - 熔断期间入站口直接丢弃并累计 droppedCount（可审计），不产生新站内信/邮件
 * ================================================================================= */
export interface KillSwitchState {
  active: boolean
  scope: 'platform' | 'club' | null
  clubId?: string | null
  reason?: string | null
  operatorName?: string | null
  stoppedAt?: string | null
  droppedCount: number
}

export const killSwitchInitial: KillSwitchState = {
  active: false,
  scope: null,
  clubId: null,
  reason: null,
  operatorName: null,
  stoppedAt: null,
  droppedCount: 0,
}

export const notificationKillSwitch: KillSwitchState = { ...killSwitchInitial }

/** 社团级紧急关闭（按社团独立存储，互不覆盖；平台级见 notificationKillSwitch） */
export const clubKillSwitches = new Map<string, KillSwitchState>()

/** 读取某社团的熔断状态（无记录时返回初始态副本） */
export function clubKillSwitchState(clubId: string): KillSwitchState {
  return clubKillSwitches.get(clubId) ?? { ...killSwitchInitial }
}

/** 应用一次开关变更（active=true 幂等保留首次 stoppedAt；关闭保留 droppedCount 审计计数） */
function applyKillSwitch(prev: KillSwitchState, input: {
  active: boolean
  scope?: 'platform' | 'club'
  clubId?: string | null
  reason?: string | null
  operatorName?: string | null
}): KillSwitchState {
  if (input.active) {
    const firstStop = prev.active ? prev.stoppedAt : now()
    return {
      ...prev,
      active: true,
      scope: input.scope ?? 'platform',
      clubId: input.clubId ?? prev.clubId ?? null,
      reason: input.reason ?? prev.reason ?? null,
      operatorName: input.operatorName ?? null,
      stoppedAt: firstStop ?? now(),
    }
  }
  return {
    ...prev,
    active: false,
    scope: null,
    clubId: null,
    reason: null,
    operatorName: null,
    stoppedAt: null,
  }
}

/** 紧急关闭（幂等：重复开启保留首次时间；开启后保留 droppedCount 累计）
 *  平台级写入 notificationKillSwitch；社团级写入 clubKillSwitches（按 clubId 隔离） */
export function setNotificationKillSwitch(input: {
  active: boolean
  scope?: 'platform' | 'club'
  clubId?: string | null
  reason?: string | null
  operatorName?: string | null
}): KillSwitchState {
  if (input.scope === 'club' && input.clubId) {
    const next = applyKillSwitch(clubKillSwitches.get(input.clubId) ?? { ...killSwitchInitial }, input)
    clubKillSwitches.set(input.clubId, next)
    return { ...next }
  }
  Object.assign(notificationKillSwitch, applyKillSwitch(notificationKillSwitch, input))
  return { ...notificationKillSwitch }
}

export function resetClubKillSwitches(): void {
  clubKillSwitches.clear()
}

/** 当前熔断是否命中（平台级全命中；社团级匹配对应社团开关；关闭态永不命中） */
function killSwitchBlocks(clubId?: string | null): boolean {
  const ks = notificationKillSwitch
  if (ks.active) {
    if (ks.scope === 'platform') return true
    if (ks.scope === 'club' && clubId != null && ks.clubId === clubId) return true
  }
  if (clubId) {
    const cks = clubKillSwitches.get(clubId)
    if (cks?.active) return true
  }
  return false
}

/** =================================================================================
 * 去重（US-NTF-01：同事件对象时间窗内不重复打扰）
 *  - 去重键 = `${userId}:${kind}:${resolvedDedupKey}`
 *  - 时间窗 DEDUP_WINDOW_MS 内重复推送被丢弃（不产生新通知）
 *  - 测试可清空
 * ================================================================================= */
export const DEDUP_WINDOW_MS = 5 * 60 * 1000

const dedupLog = new Map<string, number>()

/** 校验并记录去重键；命中窗口返回 true（应丢弃） */
function isDuplicate(userId: string, kind: string, dedupKey: string | null | undefined): boolean {
  if (!dedupKey) return false
  const key = `${userId}:${kind}:${dedupKey}`
  const last = dedupLog.get(key)
  const ts = Date.now()
  if (last !== undefined && ts - last < DEDUP_WINDOW_MS) return true
  dedupLog.set(key, ts)
  return false
}

export function resetNotificationDedup(): void {
  dedupLog.clear()
}

/** =================================================================================
 * 通知偏好（US-NTF-01：用户按事件类型订阅/退订）
 *  - 黑名单语义：set 内为「已退订」类型；缺省/未记录的类型视为订阅
 * ================================================================================= */
const notificationPreferences = new Map<string, Set<string>>()

export function setNotificationPreference(userId: string, kind: string, subscribed: boolean): void {
  let set = notificationPreferences.get(userId)
  if (!set) {
    set = new Set()
    notificationPreferences.set(userId, set)
  }
  if (subscribed) set.delete(kind)
  else set.add(kind)
}

export function isSubscribed(userId: string, kind: string): boolean {
  const set = notificationPreferences.get(userId)
  if (!set) return true // 缺省订阅
  return !set.has(kind)
}

/** 读取用户全部偏好（缺省项按模板目录补齐返回 true） */
export function listNotificationPreferences(userId: string): Record<NotificationKind, boolean> {
  const set = notificationPreferences.get(userId)
  const result = {} as Record<NotificationKind, boolean>
  for (const kind of Object.keys(notificationTemplates) as NotificationKind[]) {
    result[kind] = set ? !set.has(kind) : true
  }
  return result
}

export function resetNotificationPreferences(): void {
  notificationPreferences.clear()
}

/** =================================================================================
 * 邮件 outbox（US-NTF-02：邮件发送事实可追踪，模拟 SMTP 出站记录）
 *  - 仅模板声明 channel 含 'email' 的通知产生邮件
 * ================================================================================= */
export interface EmailRecord {
  id: string
  toUserId: string
  toEmail: string
  subject: string
  body: string
  kind: NotificationKind
  clubId?: string | null
  sentAt: string
}

let emailSeq = 0

export const emailOutbox: EmailRecord[] = []

function pushEmail(record: Omit<EmailRecord, 'id' | 'sentAt'>): void {
  emailSeq += 1
  emailOutbox.unshift({ ...record, id: 'eml-' + emailSeq, sentAt: now() })
}

export function resetEmailOutbox(): void {
  emailSeq = 0
  emailOutbox.splice(0, emailOutbox.length)
}

/** =================================================================================
 * 邮件 SMTP 配置（US-NTF-02）
 *  - 按作用域存储：platform（平台）/ club:{clubId}（社团）
 *  - 「保存强制测试通过」：未通过测试的配置不可保存（post 返回 verified:false + 未保存）
 * ================================================================================= */
export interface EmailConfigState {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  fromName: string
  encryption: 'ssl' | 'tls' | 'none'
  verified: boolean
  lastTestPassedAt: string | null
  keyRotatedAt: string | null
}

function defaultEmailConfig(fromName: string): EmailConfigState {
  return {
    smtpHost: 'smtp.example.edu.cn',
    smtpPort: 465,
    smtpUser: 'noreply@example.edu.cn',
    fromName,
    encryption: 'ssl',
    verified: false,
    lastTestPassedAt: null,
    keyRotatedAt: null,
  }
}

const emailConfigs = new Map<string, EmailConfigState>()

export function emailConfigKey(scope: 'platform' | 'club', clubId?: string | null): string {
  return scope === 'platform' ? 'platform' : `club:${clubId ?? ''}`
}

export function getEmailConfig(key: string): EmailConfigState {
  return emailConfigs.get(key) ?? defaultEmailConfig('')
}

/** 保存配置（NTF-002：未通过测试返回 verified:false，不落库） */
export function saveEmailConfig(key: string, input: Partial<EmailConfigState>): { ok: boolean; config: EmailConfigState } {
  const current = getEmailConfig(key)
  if (!current.verified && !input.verified) {
    return { ok: false, config: { ...current, ...input, verified: false } }
  }
  const next = { ...current, ...input, verified: current.verified || input.verified === true }
  emailConfigs.set(key, next)
  return { ok: true, config: next }
}

/** 测试邮件通过 → 标记 verified（测试未通过不改变状态） */
export function markEmailTestPassed(key: string): EmailConfigState {
  const next = { ...getEmailConfig(key), verified: true, lastTestPassedAt: now() }
  emailConfigs.set(key, next)
  return next
}

/** 轮换密钥：清空验证状态，需重新测试 */
export function rotateEmailKey(key: string): EmailConfigState {
  const next = { ...getEmailConfig(key), verified: false, keyRotatedAt: now() }
  emailConfigs.set(key, next)
  return next
}

export function resetEmailConfigs(): void {
  emailConfigs.clear()
}

/** =================================================================================
 * 模板渲染（{{key}} 插值 + HTML 转义，US-NTF-02 防注入）
 *  - 未传入的变量渲染为空串，模板中残留的 {{xxx}} 一并清洗
 * ================================================================================= */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderTemplate(template: string, vars: NotificationVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const raw = vars[key]
    if (raw === undefined || raw === null) return ''
    return escapeHtml(String(raw))
  })
}

/** 渲染模板目录条目（title/body/link/dedupKey/邮件字段）；channel 未含 email 时不产生邮件 */
export interface RenderedNotification {
  type: NotificationKind
  title: string
  body: string
  link: string | null
  dedupKey: string | null
  channel: NotificationChannel[]
  emailSubject?: string
  emailBody?: string
}

export function renderNotificationTemplate(kind: NotificationKind, vars: NotificationVars): RenderedNotification {
  const tpl = notificationTemplates[kind]
  const title = renderTemplate(tpl.title, vars)
  const body = renderTemplate(tpl.body, vars)
  return {
    type: kind,
    title,
    body,
    link: tpl.link ? renderTemplate(tpl.link, vars) : null,
    dedupKey: tpl.dedupKey ? renderTemplate(tpl.dedupKey, vars) : null,
    channel: [...tpl.channel],
    emailSubject: tpl.emailSubject ? renderTemplate(tpl.emailSubject, vars) : title,
    emailBody: tpl.emailBody ? renderTemplate(tpl.emailBody, vars) : body,
  }
}

/** =================================================================================
 * 统一入站口（P1-009：业务只声明「事件类型 + 变量 + 目标用户」，其余由通知中心裁决）
 *
 * 流程：渲染模板 → 偏好过滤 → 去重 → 紧急关闭熔断 → 站内信落库（+可选邮件）
 * 返回：{ delivered: 实际落库数, dropped: 丢弃数, reason: 'dedup'|'killswitch'|'unsubscribed'|null }
 * ================================================================================= */
export interface NotifyResult {
  delivered: number
  dropped: number
  reason: 'dedup' | 'killswitch' | 'unsubscribed' | null
}

export function pushNotification(
  userIds: string[],
  kind: NotificationKind,
  vars: NotificationVars = {},
  opts: { clubId?: string | null; link?: string | null; channel?: NotificationChannel[]; title?: string; body?: string } = {},
): NotifyResult {
  const rendered = renderNotificationTemplate(kind, vars)
  // 事件专属文案覆盖（如面试类多种标题/正文；未提供则用模板默认）
  const finalTitle = opts.title ?? rendered.title
  const finalBody = opts.body ?? rendered.body
  const finalLink = opts.link !== undefined ? opts.link : rendered.link
  const dedupKey = rendered.dedupKey
  const channel = opts.channel ?? rendered.channel
  let delivered = 0
  let dropped = 0
  let reason: NotifyResult['reason'] = null

  for (const userId of userIds) {
    // 1) 偏好过滤（缺省订阅）
    if (!isSubscribed(userId, kind)) {
      dropped += 1
      reason = reason ?? 'unsubscribed'
      continue
    }
    // 2) 紧急关闭熔断（平台级 / 匹配社团级；熔断丢弃不占用去重窗口）
    if (killSwitchBlocks(opts.clubId)) {
      // 计数落到命中的开关：平台级未开且社团开关命中时计到该社团，否则计到平台级
      const clubKs = opts.clubId ? clubKillSwitches.get(opts.clubId) : undefined
      if (clubKs?.active && !notificationKillSwitch.active) {
        clubKs.droppedCount += 1
      } else {
        notificationKillSwitch.droppedCount += 1
      }
      dropped += 1
      reason = reason ?? 'killswitch'
      continue
    }
    // 3) 去重（同事件对象窗口内）
    if (isDuplicate(userId, kind, dedupKey)) {
      dropped += 1
      reason = reason ?? 'dedup'
      continue
    }
    // 4) 站内信落库
    const createdAt = now()
    sysNotifications.unshift({
      id: nextNotificationId(),
      userId,
      type: kind,
      title: finalTitle,
      body: finalBody,
      read: false,
      createdAt,
      link: finalLink,
      clubName: vars.clubName ? String(vars.clubName) : null,
    })
    delivered += 1
    // 5) 邮件渠道（模板声明 email 且用户有邮箱才产生 outbox 记录）
    if (channel.includes('email')) {
      const user = mockUserById(userId)
      if (user?.email) {
        pushEmail({
          toUserId: userId,
          toEmail: user.email,
          subject: rendered.emailSubject ?? finalTitle,
          body: rendered.emailBody ?? finalBody,
          kind,
          clubId: opts.clubId ?? null,
        })
      }
    }
  }
  return { delivered, dropped, reason }
}

/** 按用户 id 查找 mock 用户：优先直接 key，其次遍历匹配真实 id（业务侧传入的是 user.id） */
function mockUserById(userId: string): MockUser | undefined {
  const direct = mockUsers[userId]
  if (direct) return direct
  for (const u of Object.values(mockUsers)) {
    if (u.id === userId) return u
  }
  return undefined
}

/** 兼容层：旧调用点可直接使用（不走模板/去重/偏好，仅站内信），供非模板化场景与测试保留 */
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
      clubName: payload.clubName ?? null,
    })
  }
}

/** 申请人 id（u-xxx）→ 可接收通知的前端用户 id；
 * 静态映射未命中时按档案学号反查 mockUsers（动态注册的 u-auto-* 档案对应 member 等登录账号） */
export function userIdOfApplicant(applicantId: string): string | null {
  for (const [userId, applicant] of Object.entries(USER_APPLICANT_MAP)) {
    if (applicant === applicantId) return userId
  }
  const studentId = applicantStudentIdOf(applicantId)
  if (!studentId) return null
  for (const user of Object.values(mockUsers)) {
    if (user.studentId === studentId) return user.id
  }
  return null
}

/** 成员 id（mem-xxx）→ 可接收通知的前端用户 id（原文被告知亦可能是申请人之类的非成员，若不存在返回 null） */
export function userIdOfMember(memberId: string): string | null {
  for (const [userId, byClub] of Object.entries(MEMBER_BY_USER)) {
    if (Object.values(byClub).includes(memberId)) return userId
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

/** 仅供测试重置自增序号（reset.ts 调用） */
export function setNotificationSeq(seq: number): void {
  notificationSeq = seq
}
