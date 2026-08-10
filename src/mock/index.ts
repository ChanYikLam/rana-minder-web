import type { MockMethod } from './types'
import {
  resolveMockUser,
  getPermissions,
  getWorkspace,
  clearMockSession,
  mockUsers,
  getMockDegraded,
  setMockDegraded,
  resetMockDegraded,
  markProfileComplete,
  markEmailVerified,
  getSchoolProfile,
  type MockUser,
} from './auth'
import { resolveMockError, mockErrorBody, MOCK_ERROR_HTTP } from './errors'
import * as db from './db'
import * as orgdb from './db-organization'
import { listNotifications, unreadCountOf, markNotificationRead, markAllNotificationsRead, listNotificationPreferences, setNotificationPreference, notificationTemplates, notificationKillSwitch, setNotificationKillSwitch, clubKillSwitchState, emailConfigKey, getEmailConfig, saveEmailConfig, markEmailTestPassed, rotateEmailKey, emailOutbox, pushNotification, userIdOfMember, userIdOfName } from './notifications'
import { recruitmentApiHandlers, withStatus, rdb, applicantIdOfUrl } from './recruitment-api'
import { correctionsDb, deriveCorrectionStatus, type CorrectionRecord, type CorrectionAuditEntry } from './db-corrections'
import { auditLogsDb, writeAuditLog } from './db-audit'
import * as formdb from './db-forms'
import {
  HIGH_RISK_COMMANDS, trackAccessEvent, listAnomalyAlerts, acknowledgeAnomaly,
  getRealDataSwitch, setRealDataSwitch, getOidcConfig, updateOidcConfig,
  issueReauthProof, consumeReauthProof, assertHighRisk, resetGovernanceState,
} from './governance'

/** 重认证 proof 机制（issueReauthProof / consumeReauthProof / assertHighRisk）统一由 governance.ts 提供 */

/** 任期到期提醒投递去重（MEM-004）：按「职位 × 提醒间隔桶」去重，模拟周期触发而非每次访问重复轰炸 */
const termRemindSent = new Set<string>()

/** 任期到期提醒（MEM-004）：派生 upcomingTermEnd 并投递站内通知，间隔桶去重 */
function deliverTermEndReminders(clubId: string) {
  const remindDays = platformConfig.termRemindDays
  const interval = Math.max(1, platformConfig.termRemindIntervalDays)
  if (remindDays <= 0) return
  for (const u of db.upcomingTermEnd(clubId, remindDays)) {
    const bucket = Math.floor(u.daysLeft / interval)
    const key = `term-remind:${u.position.id}:${bucket}`
    if (termRemindSent.has(key)) continue
    termRemindSent.add(key)
    const uid = userIdOfMember(u.memberId)
    if (uid) {
      pushNotification(
        [uid], 'member',
        { body: `您的「${u.position.departmentName}·${u.position.title}」任期将于 ${u.position.plannedEndDate} 到期（剩 ${u.daysLeft} 天），请提前准备交接或续任安排` },
        { clubId },
      )
    }
  }
}

/** 事实纠错共享内存库见 db-corrections.ts（社团/个人中心/管理员共用） */

/** 纠错状态机守卫（SM-AUD-001）：仅 submitted（含 overdue 未处置）可被批准/拒绝/撤回， */
function isCorrectionActable(record: CorrectionRecord): boolean {
  return record.status === 'submitted' || record.status === 'overdue'
}

/** 纠错提交人 → 可接收通知的前端用户 id（US-AUD-01 通知联动；mock 用户未知时返回 null） */
function correctionSubmitterUserId(record: CorrectionRecord): string | null {
  return userIdOfName(record.submitterName)
}

function correctionStateConflict(): { statusCode: number; body: { code: string; message: string; supportId: string } } {
  return {
    statusCode: 409,
    body: {
      code: 'IFC-ERR-007',
      message: '对象状态已变化，请刷新后重新选择操作',
      supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
    },
  }
}

/** 纠错审计闭环辅助：向记录追加审计轨迹条目 */
function appendCorrectionAudit(record: CorrectionRecord, entry: CorrectionAuditEntry): void {
  if (!record.auditTrail) record.auditTrail = []
  record.auditTrail.push(entry)
}

/** 纠错审计闭环辅助：将纠错动作写入审计日志库（org = 社团域，platform = 平台域） */
function writeCorrectionAuditLog(entry: CorrectionAuditEntry, record: CorrectionRecord, scope: 'org' | 'platform'): void {
  const actionMap: Record<CorrectionAuditEntry['action'], string> = {
    submit: '提交事实纠错',
    approve: '批准事实纠错',
    reject: '拒绝事实纠错',
    withdraw: '撤回事实纠错',
  }
  writeAuditLog({
    actorName: entry.actorName,
    action: actionMap[entry.action],
    targetType: record.targetType,
    targetId: record.targetId,
    detail: `${record.targetType} #${record.targetId}：${record.reason}`,
    scope,
  })
}

/** 业务规则拒绝（HTTP 422 + IFC-ERR-006；008 保留给版本/影响预览冲突 409） */
function businessError(message: string) {
  return {
    statusCode: 422,
    body: { code: 'IFC-ERR-006', message, supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
  }
}

/** 表单提交/草稿结果统一响应：
 * - IFC-ERR-009（相同操作标识对应不同内容）→ 409，与 error-map 幂等冲突语义对齐（P3-1）
 * - 其余错误 → 422 业务拒绝 */
function formResult(result: { ok: boolean; error?: string; data?: unknown }) {
  if (result.ok) return { code: 0, data: result.data }
  if (result.error && result.error.includes('相同操作标识')) {
    return {
      statusCode: 409,
      body: { code: 'IFC-ERR-009', message: result.error, supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
    }
  }
  return businessError(result.error || '操作不符合业务规则')
}

/** 无权限（HTTP 403 + IFC-ERR-003）。传入 url 时向 GOV-006 异常访问检测采集事件 */
function forbidden(url?: string, method: string = 'post') {
  if (url) {
    const user = resolveMockUser(url)
    trackAccessEvent({
      actorId: user.id,
      actorName: user.name,
      method,
      path: (url.split('?')[0] || url),
      outcome: 'forbidden',
      at: Date.now(),
    })
  }
  return {
    statusCode: 403,
    body: { code: 'IFC-ERR-003', message: '您没有执行此操作的权限', supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
  }
}

/** 平台管理员（admin 域端点统一鉴权；SRS-INV-002 服务端逐请求授权） */
function isPlatformAdmin(url: string): boolean {
  return getPermissions(resolveMockUser(url), '').includes('platform:delete:execute')
}

/** 有效权限 = 角色权限 ∪ 有效临时面试官任务折算（ORG-037：任务持有者获得面试查看/评价权限） */
function effectivePermissions(user: MockUser, clubId: string): string[] {
  const base = getPermissions(user, clubId)
  if (base.some((p) => ['club:recruitment:manage', 'club:interview:view', 'club:interview:evaluate'].includes(p))) return base
  const hasTask = rdb.interviewerTasks.some((t) => t.clubId === clubId && t.userId === user.id && t.status === 'active')
  return hasTask ? [...base, 'club:interview:view', 'club:interview:evaluate'] : base
}

/** mock 用户 id → 成员 id 映射（成员生命周期以成员视角模拟操作者）；
 * 成员 id 按「用户 × 社团」在 db.MEMBER_BY_USER 中唯一解析（db.ts），不再按用户维度静态映射 */
function actorMemberId(user: { id: string }, clubId?: string): string | null {
  return clubId ? db.resolveMemberId(user.id, clubId) : null
}

/** mock 用户 id → 候选人 id 映射（被邀请人视角） */
const USER_CANDIDATE_MAP: Record<string, string> = {
  'user-candidate-001': 'cand-001',
}

function actorCandidateId(user: { id: string }): string | null {
  return USER_CANDIDATE_MAP[user.id] || null
}

/** 管理类操作权限边界（双保险之一：mock 层按权限拦截） */
function canManageMembers(user: MockUser, clubId: string): boolean {
  return getPermissions(user, clubId).includes('club:member:manage')
}

/** 成员列表/详情可见性：本社团成员（含普通 member）可查看；平台管理员跨社团可查看 */
function canViewClubMembers(user: MockUser, clubId: string): boolean {
  return actorMemberId(user, clubId) !== null || getPermissions(user, '').includes('platform:club:manage')
}

/** 部门负责人的数据范围：其当前任职部门名；其余角色返回 null（全社团） */
function departmentScopeFor(user: MockUser, clubId: string): string | null {
  if (user.roles.find((r) => r.clubId === clubId)?.role !== 'department_leader') return null
  const memberId = actorMemberId(user, clubId)
  const member = memberId ? db.findMember(clubId, memberId) : undefined
  return member?.positions.find((p) => p.status === 'active')?.departmentName ?? null
}

/** Levenshtein 编辑距离（受控错别字近似搜索） */
function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

/** 仅社团负责人/人事管理员（不含部门负责人）可执行的成员管理操作 */
function canManageMembersFull(user: MockUser, clubId: string): boolean {
  if (!canManageMembers(user, clubId)) return false
  return user.roles.find((r) => r.clubId === clubId)?.role !== 'department_leader'
}

/** 任命/调岗/免职（P-MEM-04，仅社团负责人/人事可发起与执行） */
function canAppointments(user: MockUser, clubId: string): boolean {
  return getPermissions(user, clubId).includes('club:appointment:manage')
}

/** US-ORG-01/03：社团接入/停用/解除/重绑仅平台超级管理员（P-ORG-01 → platform:club:manage） */
function isPlatformClubManager(url: string): boolean {
  return getPermissions(resolveMockUser(url), '').includes('platform:club:manage')
}

/** 某社团是否存在进行中业务（普通停用的阻止依据，覆盖招新/联合活动） */
function hasActiveBusinessFor(clubId: string): boolean {
  const rec = (rdb.recruitmentActivities as { clubId: string; status: string }[]).some(
    (a) => a.clubId === clubId && ['in_progress', 'paused'].includes(a.status),
  )
  const joint = (rdb.jointActivities as { clubs: { clubId: string }[]; status: string }[]).some(
    (j) => j.clubs.some((c) => c.clubId === clubId) && ['published', 'invite_phase', 'closing_confirm'].includes(j.status),
  )
  return rec || joint
}

/** 权限模板（US-CFG-01/SRS-INV-019：不可变版本，草稿 → 差异预览 → 重认证发布；发布失败保留旧版） */
interface PermissionTemplate {
  id: string
  name: string
  permissions: string[]
  status: 'published' | 'draft'
  version: number
  draftVersion: number | null
}
function templateSeed(): PermissionTemplate[] {
  const leaderPerms = mockUsers.leader.roles.find((r) => r.role === 'club_leader')?.permissions ?? []
  const hrPerms = mockUsers.hr.roles[0]?.permissions ?? []
  return [
    { id: 'tpl-001', name: '社团负责人模板', permissions: leaderPerms, version: 2, status: 'published', draftVersion: null },
    { id: 'tpl-002', name: '人事模板', permissions: hrPerms, version: 1, status: 'published', draftVersion: null },
    { id: 'tpl-003', name: '面试官模板', permissions: ['club:interview:view', 'club:interview:evaluate'], version: 1, status: 'published', draftVersion: null },
  ]
}
const permissionTemplates = templateSeed()
/** MRM-010：权限模板种子快照（模板数组会被 新建/保存/diff/发布 直接改写，需随平台域重置还原） */
const permissionTemplatesSeed: PermissionTemplate[] = structuredClone(permissionTemplates)
let templatePreviewVersion = 1

/** 平台配置（US-CFG：内存态持久化；学年/届次为平台级字段，社团域不携带——P2-3） */
interface PlatformConfig {
  clubName: string
  clubDescription: string
  requireEmailVerification: boolean
  requireProfileComplete: boolean
  maxMembers: number
  allowSelfExit: boolean
  academicYearStart: number
  academicYear: string
  cohort: string
  /** 任期到期提醒（MEM-004）：到期前提前天数 + 重复提醒间隔（天），0=关闭 */
  termRemindDays: number
  termRemindIntervalDays: number
}
const platformConfig: PlatformConfig = {
  clubName: 'RanaMinder 平台', clubDescription: '社团招新管理平台',
  requireEmailVerification: true, requireProfileComplete: true,
  maxMembers: 500, allowSelfExit: true, academicYearStart: 9,
  academicYear: '2026—2027', cohort: '2026级',
  termRemindDays: 30, termRemindIntervalDays: 7,
}
/** 平台配置字段白名单（P2-017：POST 仅接受白名单字段并按期望类型校验，拒绝未知键/类型越界） */
const CONFIG_FIELD_TYPES: Record<keyof PlatformConfig, 'string' | 'boolean' | 'number'> = {
  clubName: 'string', clubDescription: 'string',
  requireEmailVerification: 'boolean', requireProfileComplete: 'boolean',
  maxMembers: 'number', allowSelfExit: 'boolean',
  academicYearStart: 'number', academicYear: 'string', cohort: 'string',
  termRemindDays: 'number', termRemindIntervalDays: 'number',
}
let platformConfigVersion = 1

/** 平台侧内存态（导出任务/平台配置）种子快照与重置；评审补漏：共享状态纳入 reset 流程，
 * 避免用例间 exportTasks/platformConfig 串扰（ESP 之前仅成员/招新等库被重置）。 */

/** 保留策略（US-AUD-04：不可变版本发布；缩短期限对已有数据 ≥7 天缓冲） */
interface RetentionPolicy {
  id: string
  scope: string
  retentionDays: number
  action: 'auto_delete' | 'archive' | 'keep'
  status: 'active' | 'draft'
  version: number
  updatedAt: string
  publishedAt: string | null
}
const retentionPolicies: RetentionPolicy[] = [
  { id: 'rp-001', scope: '已退出成员数据', retentionDays: 365, action: 'auto_delete', status: 'active', version: 1, updatedAt: '2025-07-01T00:00:00+08:00', publishedAt: '2025-07-01T00:00:00+08:00' },
  { id: 'rp-002', scope: '过期招新活动', retentionDays: 730, action: 'archive', status: 'active', version: 1, updatedAt: '2025-07-01T00:00:00+08:00', publishedAt: '2025-07-01T00:00:00+08:00' },
  { id: 'rp-003', scope: '审计日志', retentionDays: 1095, action: 'keep', status: 'active', version: 1, updatedAt: '2025-07-01T00:00:00+08:00', publishedAt: '2025-07-01T00:00:00+08:00' },
]
/** MRM-010：保留策略种子快照（新建草稿/发布会改写数组与 previewVersion，需随平台域重置还原） */
const retentionPoliciesSeed: RetentionPolicy[] = structuredClone(retentionPolicies)
let retentionPreviewVersion = 1

/** MRM-012：正式删除影响预览版本号（删除预览返回、执行时校验、成功后递增；消除硬编码魔法数 4） */
let deletePreviewVersion = 1

/**
 * 保留策略执行器（P1-010：策略不再是静态数据，具备真实执行语义 + 审计日志写入）。
 * retentionSubjects 模拟受策略约束的数据对象（按 scope 与已存续天数匹配策略）；
 * 执行时对每个 active 策略扫描到期数据，按 action 处置：
 *   auto_delete → 从生效数据中删除；archive → 标记归档；keep → 跳过（仅计数）。
 * 每次执行产生 runId、处置明细，并逐策略写入审计日志（scope=platform）。
 */
interface RetentionSubject {
  id: string
  /** 与 RetentionPolicy.scope 匹配 */
  scope: string
  label: string
  /** 已存续天数（模拟数据年龄） */
  agedDays: number
  state: 'active' | 'archived' | 'deleted'
}
export const retentionSubjects: RetentionSubject[] = [
  { id: 'rs-001', scope: '已退出成员数据', label: '成员：赵一鸣（2023 届毕业）', agedDays: 720, state: 'active' },
  { id: 'rs-002', scope: '已退出成员数据', label: '成员：钱多多（2022 届毕业）', agedDays: 1100, state: 'active' },
  { id: 'rs-003', scope: '已退出成员数据', label: '成员：孙小美（2024 届转出）', agedDays: 300, state: 'active' },
  { id: 'rs-004', scope: '过期招新活动', label: '招新活动：2023 春季补录', agedDays: 820, state: 'active' },
  { id: 'rs-005', scope: '过期招新活动', label: '招新活动：2023 秋季招新', agedDays: 900, state: 'active' },
  { id: 'rs-006', scope: '过期招新活动', label: '招新活动：2025 春季补录', agedDays: 100, state: 'active' },
  { id: 'rs-007', scope: '审计日志', label: '审计日志批次：2022-Q4', agedDays: 1400, state: 'active' },
]

export interface RetentionExecutionResult {
  policyId: string
  scope: string
  action: RetentionPolicy['action']
  retentionDays: number
  /** 本次实际处置（删除/归档）的对象数 */
  executedCount: number
  /** 本次未到期 / 已处置过的对象数 */
  skippedCount: number
  executedAt: string
  auditRef: string
}

let lastRetentionExecution: { runId: string; executedAt: string; results: RetentionExecutionResult[] } | null = null

const retentionSubjectsSeed: RetentionSubject[] = structuredClone(retentionSubjects)

/** 测试/演示用：重置保留策略执行器状态（受控对象恢复 active、清空上次执行记录）。
 * MRM-010：一并还原 retentionPolicies（新建草稿/发布会改写数组）与 retentionPreviewVersion，
 * 避免「先跑发布用例、再跑断言策略状态用例」时策略残留（如多出一条已发布草稿）。 */
export function resetRetentionState(): void {
  retentionSubjects.splice(0, retentionSubjects.length, ...structuredClone(retentionSubjectsSeed))
  retentionPolicies.splice(0, retentionPolicies.length, ...structuredClone(retentionPoliciesSeed))
  retentionPreviewVersion = 1
  lastRetentionExecution = null
}

function retentionExecutionRunId(): string {
  return 'RPX-' + Date.now()
}

function runRetentionExecutor(runId: string): RetentionExecutionResult[] {
  const now = new Date().toISOString()
  const results: RetentionExecutionResult[] = []
  for (const policy of retentionPolicies) {
    if (policy.status !== 'active') continue
    let executedCount = 0
    let skippedCount = 0
    for (const subject of retentionSubjects) {
      if (subject.scope !== policy.scope) continue
      if (subject.state !== 'active') { skippedCount += 1; continue }
      if (subject.agedDays < policy.retentionDays) { skippedCount += 1; continue }
      if (policy.action === 'auto_delete') subject.state = 'deleted'
      else if (policy.action === 'archive') subject.state = 'archived'
      // keep：保留，不处置
      executedCount += 1
    }
    results.push({
      policyId: policy.id,
      scope: policy.scope,
      action: policy.action,
      retentionDays: policy.retentionDays,
      executedCount,
      skippedCount,
      executedAt: now,
      auditRef: runId,
    })
  }
  return results
}

function recordRetentionExecution(operatorName: string): { runId: string; executedAt: string; results: RetentionExecutionResult[] } {
  const runId = retentionExecutionRunId()
  const executedAt = new Date().toISOString()
  const results = runRetentionExecutor(runId)
  lastRetentionExecution = { runId, executedAt, results }
  for (const r of results) {
    writeAuditLog({
      actorName: operatorName,
      action: `执行保留策略（${r.action === 'auto_delete' ? '自动删除' : r.action === 'archive' ? '归档' : '保留（keep）'}）`,
      targetType: '保留策略',
      targetId: r.policyId,
      detail: `「${r.scope}」处置 ${r.executedCount} 条 / 跳过 ${r.skippedCount} 条（保留 ${r.retentionDays} 天）`,
      scope: 'platform',
    })
  }
  writeAuditLog({
    actorName: operatorName,
    action: '触发保留策略批量执行',
    targetType: '保留策略',
    targetId: runId,
    detail: `共执行 ${results.length} 个生效策略`,
    scope: 'platform',
  })
  return { runId, executedAt, results }
}

/** 辞职申请审批（MEM-005，仅社团负责人/人事可查看与审批） */
function canApproveResignation(user: MockUser, clubId: string): boolean {
  return getPermissions(user, clubId).includes('club:resignation:approve')
}

/** 导出任务（内存态；创建后经 settleExportTask 按时间惰性流转，替代 setTimeout 硬改）；
 * MRM-009：增加 'expired' 终态与 GC 保留窗口（completed 超过 EXPORT_KEEP_MS 仍占位但前端按 expired 隐藏）。 */
interface ExportTask {
  id: string
  clubId: string
  type: string
  status: 'generating' | 'processing' | 'completed' | 'failed' | 'expired'
  createdAt: string
  completedAt: string | null
  /** MRM-009：failed 发生时间（GC 判定超 7 天清理的基准，避免复用 completedAt 语义不清） */
  failedAt: string | null
  expiredAt: string | null
  downloadUrl: string | null
  fileSize: number
  scope: string
  includeContact: boolean
  includeFiles: boolean
}
const exportTasks: ExportTask[] = [
  { id: 'exp-001', clubId: 'club-001', type: '成员名单', status: 'completed', createdAt: '2025-07-28T10:00:00+08:00', completedAt: '2025-07-28T10:01:00+08:00', failedAt: null, expiredAt: '2025-08-04T10:00:00+08:00', downloadUrl: '#', fileSize: 24576, scope: '全社团', includeContact: true, includeFiles: false },
  // 种子任务：远早于生成窗口的 generating 任务，首次读取即按状态机判为超时失败（EXP 失败态可观测）
  { id: 'exp-002', clubId: 'club-001', type: '招新统计', status: 'generating', createdAt: '2025-08-01T12:00:00+08:00', completedAt: null, failedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0, scope: '全社团', includeContact: false, includeFiles: false },
]

/** 平台级导出任务（/api/admin/exports，与社团级同状态机） */
const adminExportTasks: ExportTask[] = [
  { id: 'exp-003', clubId: '', type: '全平台成员名单', status: 'completed', createdAt: '2025-08-01T10:00:00+08:00', completedAt: '2025-08-01T10:05:00+08:00', failedAt: null, expiredAt: '2025-08-02T10:00:00+08:00', downloadUrl: '#', fileSize: 32768, scope: '全社团', includeContact: true, includeFiles: false },
]

/** 共享状态种子快照（reset.ts 复用，保证用例间确定性） */
const sharedStateSeed = {
  exportTasks: structuredClone(exportTasks),
  adminExportTasks: structuredClone(adminExportTasks),
  platformConfig: structuredClone(platformConfig),
  platformConfigVersion,
  templatePreviewVersion,
  // MRM-012：正式删除预览版本号（删除执行成功后递增，需随平台域重置还原）
  deletePreviewVersion,
} as const

/** 平台共享状态重置：导出任务（含 processing 中间态任务成员批量）/ 平台配置与版本 / 异常序号 /
 * 权限模板 / 保留策略 / 重认证 proof 等治理状态 / 任期提醒去重桶。
 * 与 reset.ts 的 resetDb/resetRecruitmentDB 等并列，供测试与演示环境一键还原。
 *
 * MRM-009：seed 中静态时间戳的 completed 任务（exp-001/exp-003）在 reset 时把 expiredAt 重新设到
 * "当前时间 + 7 天"——保证演示与测试期间 seed 任务不会被 settleExportTask 误转 expired，也不会被
 * gcExportTasks 清出；动态创建的任务走正常过期与 GC 路径。
 *
 * MRM-010：补平台域共享状态缺失的重置——permissionTemplates / retentionPolicies /
 * retentionPreviewVersion / lastRetentionExecution（复用 resetRetentionState）以及
 * reauthProofs、真实数据开关、异常访问告警（resetGovernanceState）、termRemindSent 去重桶；
 * 否则「先跑含发布用例的测试、再跑断言策略状态的用例」时发布残留会污染后续断言。 */
export function resetSharedState(): void {
  const futureExpiry = new Date(Date.now() + 7 * DAY_MS).toISOString()
  const rehydratedExportTasks = structuredClone(sharedStateSeed.exportTasks).map((t) => (
    t.status === 'completed' && t.expiredAt ? { ...t, expiredAt: futureExpiry } : t
  ))
  const rehydratedAdminExportTasks = structuredClone(sharedStateSeed.adminExportTasks).map((t) => (
    t.status === 'completed' && t.expiredAt ? { ...t, expiredAt: futureExpiry } : t
  ))
  exportTasks.splice(0, exportTasks.length, ...rehydratedExportTasks)
  adminExportTasks.splice(0, adminExportTasks.length, ...rehydratedAdminExportTasks)
  Object.assign(platformConfig, structuredClone(sharedStateSeed.platformConfig))
  platformConfigVersion = sharedStateSeed.platformConfigVersion
  templatePreviewVersion = sharedStateSeed.templatePreviewVersion
  // MRM-012：正式删除预览版本号还原（删除执行成功后会递增，避免跨用例残留）
  deletePreviewVersion = sharedStateSeed.deletePreviewVersion
  // MRM-010：权限模板数组还原（发布/保存/diff 会改写模板状态与 previewVersion）
  permissionTemplates.splice(0, permissionTemplates.length, ...structuredClone(permissionTemplatesSeed))
  // MRM-010：保留策略数组/previewVersion/执行记录还原（新建草稿与发布会改写）
  resetRetentionState()
  // MRM-010：重认证 proof、真实数据开关、异常访问告警与高风险命令 enforced 标志复位
  resetGovernanceState()
  // MRM-010：任期到期提醒去重桶清空，避免跨用例重复投递去重残留
  termRemindSent.clear()
  db.resetAnomalySeq()
}

const EXPORT_START_MS = 500
const EXPORT_GENERATE_MS = 3000
const EXPORT_EXPIRY_MS = 24 * 3600 * 1000
const EXPORT_STALE_FAIL_MS = 24 * 3600 * 1000
/** MRM-009：completed 任务超过此窗口后由 settleExportTask 自动转 expired（前端可识别，列表继续可见以保留审计痕迹）。
 * 默认 365 天——保留周期够长，正常用户 24h 失效后下载链接即不可用，但任务元数据保留供审计查询，
 * 测试 seed 任务不会在演示期间被误清。生产可通过环境变量调短。 */
const EXPORT_KEEP_AFTER_EXPIRY_MS = 365 * 24 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000

/** P2-017：周期对比趋势——本期 > 上期 → up（差值），本期 < 上期 → down（差值），持平 → flat/0 */
function trendOf(current: number, previous: number): { trend: 'up' | 'down' | 'flat'; trendValue: number } {
  if (current > previous) return { trend: 'up', trendValue: current - previous }
  if (current < previous) return { trend: 'down', trendValue: previous - current }
  return { trend: 'flat', trendValue: 0 }
}

/** 导出任务读取时惰性结算（替代 setTimeout 硬改 completed，可确定性 + 失败态可观测）：
 * 状态机补真实中间态：generating（排队待调度）--满 EXPORT_START_MS--> processing（生成中）
 * --满 EXPORT_GENERATE_MS--> completed（附下载链接/大小，24h 失效）；
 * 任一排队节点超 24h 仍未完成 → failed（自愈，不永久卡生成中）。
 * 补中间态前原恒为 0 的 processing 有了真实数据源（页面对应「处理中」卡片）。
 *
 * MRM-009：completed 过期后转 expired（前端可见"已过期"标签，提供用户与审计可观测性）；
 * 真正从数组中 GC 由 gcExportTasks 单独负责，避免每个 reader 都 splice 一次。
 * 无 setTimeout 硬改——所有状态推进都是惰性/同步的，调用方责任明确、可测试。 */
function settleExportTask(task: ExportTask): void {
  // completed：到期后转 expired（保留占位，前端展示「已过期」；彻底 GC 由 gcExportTasks 处理）
  if (task.status === 'completed' && task.expiredAt) {
    if (Date.now() >= new Date(task.expiredAt).getTime() + EXPORT_KEEP_AFTER_EXPIRY_MS) {
      task.status = 'expired'
    }
    return
  }
  if (task.status !== 'generating' && task.status !== 'processing') return
  const elapsed = Date.now() - new Date(task.createdAt).getTime()
  if (elapsed >= EXPORT_STALE_FAIL_MS) {
    // MRM-009：失败时记录 failedAt（completedAt 仅 completed 语义），供 gcExportTasks 判定超 7 天清理
    task.status = 'failed'
    task.failedAt = new Date().toISOString()
    return
  }
  if (task.status === 'processing') {
    if (elapsed >= EXPORT_GENERATE_MS) {
      task.status = 'completed'
      task.completedAt = new Date().toISOString()
      task.expiredAt = new Date(Date.now() + EXPORT_EXPIRY_MS).toISOString()
      task.downloadUrl = `#exp-${task.id}`
      task.fileSize = 1024 * (16 + Math.floor(Math.random() * 48))
    }
    return
  }
  if (elapsed >= EXPORT_START_MS) task.status = 'processing'
}

/** MRM-009：导出任务数组回落途径——清扫超出保留窗口的 expired 任务，避免长期运行后 exportTasks 无限增长。
 * 调用时机：每次 GET 列表结算后，或测试 resetSharedState 时（已在原 resetSharedState 链路中通过 seed 覆盖，
 * 但测试若在创建后调用此函数可立即清场）。
 * 返回被清理的数量，便于测试断言。 */
function gcExportTasks(tasks: ExportTask[]): number {
  const now = Date.now()
  let removed = 0
  for (let i = tasks.length - 1; i >= 0; i--) {
    const t = tasks[i]
    if (t.status === 'expired') {
      tasks.splice(i, 1)
      removed++
      continue
    }
    // failed 任务：超 7 天自动清理（仅占位审计即可，无下载价值）。
    // 基准用 failedAt（settleExportTask 转 failed 时记录）；对兼容旧数据无 failedAt 时回退 completedAt。
    const failedAtMs = t.failedAt ? new Date(t.failedAt).getTime() : (t.completedAt ? new Date(t.completedAt).getTime() : 0)
    if (t.status === 'failed' && failedAtMs && now - failedAtMs > 7 * DAY_MS) {
      tasks.splice(i, 1)
      removed++
    }
  }
  return removed
}

/** 当前用户可导出数据作用域：部门负责人仅本部门，其余全社团（EXP-001） */
function exportScopeFor(user: MockUser, clubId: string): string {
  return departmentScopeFor(user, clubId) || '全社团'
}

/**
 * vite-plugin-mock 的 query 传递缺陷：
 * GET 带查询参数时 query 只含 URL 查询参数（路径参数丢失）；
 * POST 时 query 只含路径参数（URL 查询参数丢失）。
 * 这里在注册时统一把路径参数合并回 query，避免 handler 里依赖特定调用方式。
 */
function pathParamsFrom(url: string, pattern: string): Record<string, string> {
  try {
    const { pathname } = new URL(url, 'http://localhost')
    const pathSegs = pathname.split('/').filter(Boolean)
    const pattSegs = pattern.split('/').filter(Boolean)
    const out: Record<string, string> = {}
    pattSegs.forEach((s, i) => {
      if (s.startsWith(':')) out[s.slice(1)] = pathSegs[i] ?? ''
    })
    return out
  } catch {
    return {}
  }
}

function mergePathParams(handler: MockMethod): MockMethod {
  const original = handler.response
  const pattern = handler.url
  return {
    ...handler,
    response(request: { url: string; body: unknown; query: Record<string, string>; headers: Record<string, string> }) {
      const query = { ...pathParamsFrom(request.url, pattern), ...request.query }
      return (original as (r: typeof request) => unknown)({ ...request, query })
    },
  }
}

/** 会话处理器 */

/** 资料最新版本（乐观锁）：PUT /api/auth/profile 每次成功保存 +1，初始视为 1 */
const profileLatestVersion: Record<string, number> = {}

/** 重置身份域 mock 状态（测试隔离；会话锚定由 clearMockSession 负责） */
export function resetIdentityMockState(): void {
  for (const key of Object.keys(profileLatestVersion)) {
    delete profileLatestVersion[key]
  }
  resetMockDegraded()
}

const identityHandlers: MockMethod[] = [
  {
    url: '/api/auth/session',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      // 账号禁用（IDN 域）：会话拒绝建立，登录失败
      if (user.disabled) {
        return {
          statusCode: 403,
          body: {
            code: 'IFC-ERR-011',
            message: '账号已被禁用，请联系平台管理员',
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          },
        }
      }
      // SRS-FAIL-001 降级模式：Casdoor 故障时由演示开关置位，输出 15 分钟白名单窗口起点
      const degraded = getMockDegraded()
      return {
        code: 0,
        data: {
          user: {
            id: user.id,
            studentId: user.studentId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            avatar: user.avatar,
            emailVerified: user.emailVerified,
            profileComplete: user.profileComplete,
          },
          profileGate: {
            complete: user.profileComplete,
            emailVerified: user.emailVerified,
          },
          degraded: degraded.enabled,
          degradedSince: degraded.enabled ? new Date(degraded.since).toISOString() : null,
          permissions: effectivePermissions(user, user.currentClubId || ''),
          workspace: getWorkspace(user),
        },
      }
    },
  },
  {
    url: '/api/auth/logout',
    method: 'delete',
    response: () => {
      clearMockSession()
      return { code: 0, data: null }
    },
  },
  {
    url: '/api/me/clubs',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: {
          clubs: user.roles
            .filter((r) => r.clubId)
            .map((r) => ({
              clubId: r.clubId,
              clubName: r.clubName,
              role: r.role,
            })),
        },
      }
    },
  },
  {
    url: '/api/auth/profile',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: {
          // 返回当前版本号：页面乐观锁以响应版本为准（P2-3：资料门翻转与版本号联动）
          version: profileLatestVersion[user.id] ?? 1,
          studentId: user.studentId,
          name: user.name,
          email: user.email,
          phone: user.phone,
          emailVerified: user.emailVerified,
          profileComplete: user.profileComplete,
          // 白名单字段与 Casdoor 双向同步状态（演示：手机号处于同步中）
          syncStatus: {
            email: 'synced',
            phone: user.profileComplete ? 'pending' : 'synced',
          },
        },
      }
    },
  },
  {
    url: '/api/auth/profile',
    method: 'put',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown>; expectedVersion?: number } }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      // 乐观锁：expectedVersion 与 mock 侧最新版本比对（与 saveFormDraft 语义一致），取代原先 expectedVersion<1 的死条件
      const currentVersion = profileLatestVersion[user.id] ?? 1
      if (body.expectedVersion !== undefined && body.expectedVersion !== currentVersion) {
        return {
          statusCode: 409,
          body: {
            code: 'IFC-ERR-008',
            message: '数据版本已变化，请刷新后重试',
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
            currentData: { email: user.email, phone: user.phone },
          },
        }
      }
      const input = body.input || {}
      // 仅当字段「非空且与现值不同」才算实际数据变更：空 input:{} 不消耗版本号，
      // 「编辑后原样提交」（提交值 === 现值）同样不消耗，避免无实际差异的提交使版本不断递增
      const hasUpdate =
        (typeof input.email === 'string' && input.email !== '' && input.email !== user.email) ||
        (typeof input.phone === 'string' && input.phone !== '' && input.phone !== user.phone)

      // 无实际数据变更时跳过版本递增，直接返回当前资料
      if (!hasUpdate) {
        return {
          code: 0,
          data: {
            version: currentVersion,
            studentId: user.studentId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            emailVerified: user.emailVerified,
            profileComplete: user.profileComplete,
            syncStatus: {
              email: 'synced',
              phone: user.profileComplete ? 'pending' : 'synced',
            },
          },
        }
      }

      // 版本登记先于保存生效：比对一旦通过即占用新版本号，后续同版本提交必然 409，
      // 保证「保存生效与版本登记」原子一致（连续两次 expectedVersion=1 时第二次不会重复落库）
      profileLatestVersion[user.id] = currentVersion + 1
      // 保存生效：白名单字段更新 + 资料补齐（资料门联动 profileComplete）
      if (typeof input.email === 'string' && input.email) user.email = input.email
      if (typeof input.phone === 'string' && input.phone) user.phone = input.phone
      markProfileComplete(user.id)
      return {
        code: 0,
        data: {
          version: currentVersion + 1,
          studentId: user.studentId,
          name: user.name,
          email: user.email,
          phone: user.phone,
          emailVerified: user.emailVerified,
          profileComplete: user.profileComplete,
          // 保存后同步启动：白名单字段进入「同步中」
          syncStatus: {
            email: 'synced',
            phone: 'pending',
          },
        },
      }
    },
  },
  {
    url: '/api/auth/profile/send-email-code',
    method: 'post',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      return { code: 0, data: { sent: true, expiresIn: 300 } }
    },
  },
  {
    url: '/api/auth/profile/verify-email',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { code: string } } }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      if (body.input?.code !== '123456') {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-007',
            message: '验证码不正确或已过期',
            fieldErrors: { code: ['验证码不正确或已过期'] },
          },
        }
      }
      // 验证通过：邮箱验证态落库（资料门联动 emailVerified → 会话 profileGate 翻转）
      const user = resolveMockUser(url)
      markEmailVerified(user.id)
      return { code: 0, data: { emailVerified: true } }
    },
  },
  // 同步冲突清单（sync-conflict 模式）：本地档案 vs 学校侧（Casdoor 权威侧），仅返回不一致字段
  {
    url: '/api/auth/profile/sync-conflicts',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const school = getSchoolProfile(user.id)
      const labels: Record<string, string> = { name: '姓名', studentId: '学号', email: '邮箱', phone: '手机号' }
      const conflicts: Array<{ field: string; label: string; localValue: string; remoteValue: string }> = []
      for (const field of ['name', 'studentId', 'email', 'phone'] as const) {
        const local = String(user[field] ?? '')
        const remote = String(school[field] ?? '')
        if (local !== remote) {
          conflicts.push({ field, label: labels[field], localValue: local, remoteValue: remote })
        }
      }
      return { code: 0, data: { conflicts, local: { name: user.name, studentId: user.studentId, email: user.email, phone: user.phone } } }
    },
  },
  {
    url: '/api/auth/profile/sync-conflict',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { field: string; chosenValue: string } } }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const field = body.input?.field
      const chosenValue = body.input?.chosenValue
      if (!field || !['name', 'email', 'phone', 'studentId'].includes(field)) {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-006',
            message: '不支持的冲突字段',
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          },
        }
      }
      // 写回前按字段类型做格式校验，与 PUT /auth/profile 保持一致（避免垃圾格式值经冲突解决落库）
      if (typeof chosenValue === 'string' && chosenValue !== '') {
        if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chosenValue)) {
          return {
            statusCode: 422,
            body: {
              code: 'IFC-ERR-006',
              message: '邮箱格式不正确',
              fieldErrors: { [field]: ['邮箱格式不正确'] },
              supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
            },
          }
        }
        if (field === 'phone' && !/^1[3-9]\d{9}$/.test(chosenValue)) {
          return {
            statusCode: 422,
            body: {
              code: 'IFC-ERR-006',
              message: '手机号格式不正确',
              fieldErrors: { [field]: ['手机号格式不正确'] },
              supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
            },
          }
        }
      }
      // 空值或与本地当前值相同的提交不产生实际变更，直接返回当前资料
      const user = resolveMockUser(url)
      const typedField = field as 'name' | 'email' | 'phone' | 'studentId'
      // 防御性判断：目标字段不存在时拒绝写回，避免 String(undefined ?? '') 产生 'undefined' 字面量（审计 P3）
      if (user[typedField] === undefined) {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-006',
            message: '不支持的冲突字段',
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          },
        }
      }
      const currentValue = String(user[typedField])
      if (typeof chosenValue !== 'string' || chosenValue === '' || chosenValue === currentValue) {
        return {
          code: 0,
          data: {
            studentId: user.studentId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            emailVerified: user.emailVerified,
            profileComplete: user.profileComplete,
          },
        }
      }
      // 真正写回本地档案（选择学校侧值时用学校侧值覆盖本地）
      user[typedField] = chosenValue
      markProfileComplete(user.id)
      return {
        code: 0,
        data: {
          studentId: user.studentId,
          name: user.name,
          email: user.email,
          phone: user.phone,
          emailVerified: user.emailVerified,
          profileComplete: user.profileComplete,
        },
      }
    },
  },
  {
    url: '/api/auth/reauth',
    method: 'post',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: issueReauthProof(user.id),
      }
    },
  },
  {
    url: '/api/auth/logout',
    method: 'post',
    response: () => {
      clearMockSession()
      return { code: 0, data: null }
    },
  },
  {
    url: '/api/auth/casdoor/login-url',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      // mock：直接返回一个"已登录"的回调地址
      const user = query.user || 'leader'
      return {
        code: 0,
        data: {
          loginUrl: `/?_mock_user=${user}&_mock_login=success`,
        },
      }
    },
  },
  /** 演示专用（非 API 契约）：降级模式开关，供演示脚本/DevTools 触发 SRS-FAIL-001 白名单窗口 */
  {
    url: '/api/mock/degraded',
    method: 'post',
    response: ({ body }: { body: { enabled?: boolean } }) => {
      setMockDegraded(body?.enabled !== false)
      const s = getMockDegraded()
      return {
        code: 0,
        data: {
          degraded: s.enabled,
          degradedSince: s.enabled ? new Date(s.since).toISOString() : null,
        },
      }
    },
  },
  {
    url: '/api/mock/degraded',
    method: 'get',
    response: () => {
      const s = getMockDegraded()
      return {
        code: 0,
        data: {
          degraded: s.enabled,
          degradedSince: s.enabled ? new Date(s.since).toISOString() : null,
        },
      }
    },
  },
]

/** 公开目录处理器 */

// ================= 公开目录（REC-047） =================

type SearchLayer = 'exact' | 'substring' | 'fuzzy'

interface CatalogActivity {
  id: string
  clubId: string
  clubName: string
  title: string
  type: 'recruitment' | 'joint'
  status: string
  enrolling: boolean
  deadline: string
  description: string
  layer: SearchLayer
}

/** REC-047「正在报名」派生：报名通道权威当前状态必须为“开放”，活动不得处于整体暂停或终态覆盖，
 *  且当前有效截止必须严格晚于查询时刻；不新增“正在报名”活动状态，也不代表个人报名资格 */
function enrollingAt(now: number, a: { status: string; channelStatus: string; deadline: string }): boolean {
  if (a.channelStatus !== 'open') return false
  const terminal = new Set(['paused', 'suspended', 'force_suspended', 'cancelled', 'force_closed', 'closed', 'completed', 'force_completed', 'archived'])
  if (terminal.has(a.status)) return false
  return new Date(a.deadline).getTime() > now
}

/** 平台时区自然日起点 + offset 天（快捷范围共用同一区间语义） */
function naturalDayStart(offsetDays: number): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.getTime()
}

/** REC-047 名称分层：精确命中 → 中文连续子串命中 → 受控近似候选；有效字符不足 3 个只做前两层 */
function appliesActivityLayers(list: CatalogActivity[], keyword: string): CatalogActivity[] {
  const kw = keyword.trim()
  if (!kw) return list
  const valid = kw.replace(/[\s\u3000]/g, '')
  const exact: CatalogActivity[] = []
  const substring: CatalogActivity[] = []
  const fuzzy: CatalogActivity[] = []
  for (const item of list) {
    if (item.title === kw) {
      item.layer = 'exact'
      exact.push(item)
    } else if (item.title.includes(kw)) {
      item.layer = 'substring'
      substring.push(item)
    } else if (valid.length >= 3 && editDistance(item.title, valid) <= 1) {
      item.layer = 'fuzzy'
      fuzzy.push(item)
    }
  }
  return [...exact, ...substring, ...fuzzy]
}

/** 按报名状态与截止时间筛选当前活动（快捷范围按平台时区自然日；截止命中不等于正在报名） */
function filterCurrentActivities(list: CatalogActivity[], status: string, range: string, fromMs: number | null, toMs: number | null): CatalogActivity[] {
  let out = list
  if (status === 'enrolling') out = out.filter((a) => a.enrolling)
  if (range === 'today') {
    out = out.filter((a) => {
      const d = new Date(a.deadline).getTime()
      return d >= naturalDayStart(0) && d < naturalDayStart(1)
    })
  } else if (range === '3d') {
    out = out.filter((a) => {
      const d = new Date(a.deadline).getTime()
      return d >= naturalDayStart(0) && d < naturalDayStart(3)
    })
  } else if (range === '7d') {
    out = out.filter((a) => {
      const d = new Date(a.deadline).getTime()
      return d >= naturalDayStart(0) && d < naturalDayStart(7)
    })
  } else if (range === 'custom' && fromMs !== null && toMs !== null) {
    out = out.filter((a) => {
      const d = new Date(a.deadline).getTime()
      return d >= fromMs && d <= toMs
    })
  }
  return out
}

function toCatalogRow(a: { id: string; clubId: string; clubName: string; title: string; description: string; status: string; channelStatus: string; deadline: string }, type: 'recruitment' | 'joint', now: number): CatalogActivity {
  return {
    id: a.id, clubId: a.clubId, clubName: a.clubName, title: a.title,
    type, status: a.status, enrolling: enrollingAt(now, a), deadline: a.deadline, description: a.description, layer: 'exact',
  }
}

const publicHandlers: MockMethod[] = [
  {
    url: '/api/explore/clubs',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const kw = (query.q || '').trim()
      const clubs = orgdb
        .listClubAccesses()
        .filter((c) => c.status === 'enabled')
        .map((c) => ({
          id: c.clubId,
          name: c.clubName,
          description: c.description,
          memberCount: db.getMemberStats(c.clubId).total,
          logo: null,
          layer: 'exact' as SearchLayer,
        }))
      if (kw) {
        const valid = kw.replace(/[\s\u3000]/g, '')
        const exact: typeof clubs = []
        const substring: typeof clubs = []
        const fuzzy: typeof clubs = []
        for (const c of clubs) {
          if (c.name === kw) { c.layer = 'exact'; exact.push(c) }
          else if (c.name.includes(kw)) { c.layer = 'substring'; substring.push(c) }
          else if (valid.length >= 3 && editDistance(c.name, valid) <= 1) { c.layer = 'fuzzy'; fuzzy.push(c) }
        }
        return {
          code: 0,
          data: { items: [...exact, ...substring, ...fuzzy], nextCursor: null },
        }
      }
      return {
        code: 0,
        data: { items: clubs, nextCursor: null },
      }
    },
  },
  {
    url: '/api/explore/activities',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const now = Date.now()
      const kw = (query.q || '').trim()
      const typeFilter = query.type || 'all'
      const statusFilter = query.status || 'all'
      const range = query.range || ''
      const fromMs = query.deadlineFrom ? new Date(query.deadlineFrom).getTime() : null
      const toMs = query.deadlineTo ? new Date(query.deadlineTo).getTime() : null

      // 已发布普通招新：当前（进行中/暂停）与历史（完成/强制完成/归档/取消）
      const recCurrent = rdb.recruitmentActivities.filter((a) => a.status === 'in_progress' || a.status === 'paused')
      const recHistory = rdb.recruitmentActivities.filter((a) => ['completed', 'cancelled', 'force_completed', 'archived'].includes(a.status))
      // 已首次公布的联合活动（JNT-004/JNT-029）：当前与终态分区
      const jointPublished = rdb.jointActivities.filter((j) => j.publishedAt)
      const jointTerminal = new Set(['closed', 'completed', 'cancelled', 'force_closed'])
      const jointCurrent = jointPublished.filter((j) => !jointTerminal.has(j.status))
      const jointHistory = jointPublished.filter((j) => jointTerminal.has(j.status))

      const toJointRow = (j: rdb.JointActivity): CatalogActivity =>
        toCatalogRow(
          {
            id: j.id, clubId: j.clubs[0]?.clubId || '', clubName: j.clubs.map((c) => c.clubName).join('、'),
            title: j.title, description: j.description, status: j.status,
            channelStatus: j.channelStatus, deadline: j.deadline,
          },
          'joint',
          now,
        )

      const current: CatalogActivity[] = [
        ...(typeFilter === 'all' || typeFilter === 'recruitment' ? recCurrent.map((a) => toCatalogRow(a, 'recruitment', now)) : []),
        ...(typeFilter === 'all' || typeFilter === 'joint' ? jointCurrent.map(toJointRow) : []),
      ]
      const history: CatalogActivity[] = [
        ...(typeFilter === 'all' || typeFilter === 'recruitment' ? recHistory.map((a) => toCatalogRow(a, 'recruitment', now)) : []),
        ...(typeFilter === 'all' || typeFilter === 'joint' ? jointHistory.map(toJointRow) : []),
      ]

      return {
        code: 0,
        data: {
          items: filterCurrentActivities(appliesActivityLayers(current, kw), statusFilter, range, fromMs, toMs),
          history: appliesActivityLayers(history, kw),
          nextCursor: null,
          queryAt: new Date(now).toISOString(),
        },
      }
    },
  },
]

/** 社团工作空间处理器 */
const organizationHandlers: MockMethod[] = [
  {
    url: '/api/org/:clubId/context',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const membership = user.roles.find((role) => role.clubId === query.clubId)
      if (!membership) {
        return { statusCode: 403, body: { code: 'IFC-ERR-004', message: '工作空间不可访问' } }
      }
      const memberId = db.resolveMemberId(user.id, membership.clubId)
      return {
        code: 0,
        data: {
          clubId: membership.clubId,
          clubName: membership.clubName,
          role: membership.role,
          permissions: effectivePermissions(user, membership.clubId),
          memberId,
        },
      }
    },
  },
  {
    url: '/api/org/:clubId/dashboard',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const permissions = getPermissions(user, query.clubId || '')
      const pendingApplications = db.departmentApplications.filter((a) => a.clubId === query.clubId && a.status === 'under_review').length
      const pendingInvitations = db.membershipInvitations.filter((i) => i.clubId === query.clubId && (i.status === 'sent' || i.status === 'pending_acceptance')).length
      const membership = user.roles.find((r) => r.clubId === query.clubId)
      const submittedApps = rdb.recruitmentApplications.filter((a) => a.clubId === query.clubId && a.status === 'submitted').length
      const scheduledInterviews = rdb.recruitmentInterviews.filter((i) => i.clubId === query.clubId && (i.status === 'scheduled' || i.status === 'pending_selection')).length
      const pendingRecInvitations = rdb.recruitmentInvitations.filter((i) => i.clubId === query.clubId && i.status === 'pending_acceptance').length
      return {
        code: 0,
        data: {
          club: { id: query.clubId, name: membership?.clubName || query.clubId },
          role: membership?.role || 'member',
          permissions,
          metrics: {
            pendingReviews: submittedApps + pendingApplications + pendingInvitations,
            pendingInterviews: Math.max(0, submittedApps - scheduledInterviews),
            pendingResults: 0,
            syncErrors: 2,
          },
          todos: [
            { id: 'todo-001', type: 'application_review', title: '待审核报名申请', count: submittedApps },
            { id: 'todo-002', type: 'interview_schedule', title: '待安排面试', count: Math.max(0, submittedApps - scheduledInterviews) },
            { id: 'todo-003', type: 'invitation_pending', title: '待确认录取邀请', count: pendingRecInvitations },
          ],
          recentActivities: [],
        },
      }
    },
  },
]

/** 通知处理器（动态内存库：业务操作实时 push，已读/未读真实落状态） */
const notificationHandlers: MockMethod[] = [
  {
    url: '/api/notifications',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const items = listNotifications(user.id, query.unreadOnly === 'true')
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  {
    url: '/api/notifications/unread-count',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      return { code: 0, data: { count: unreadCountOf(user.id) } }
    },
  },
  {
    url: '/api/notifications/:id/read',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      const id = decodeURIComponent(query.id ?? '')
      markNotificationRead(user.id, id)
      return { code: 0, data: null }
    },
  },
  {
    url: '/api/notifications/read-all',
    method: 'post',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      markAllNotificationsRead(user.id)
      return { code: 0, data: null }
    },
  },
]

/** 个人中心处理器 */
const personalHandlers: MockMethod[] = [
  {
    url: '/api/me/todo',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const applicantId = applicantIdOfUrl(url)
      const items: { id: string; type: string; title: string; description: string; deadline: string; link: string }[] = []
      // 录取邀请（普通招新）：仅展示发给当前用户的待处理邀请
      if (applicantId) {
        for (const inv of rdb.recruitmentInvitations) {
          if (inv.applicantId !== applicantId || inv.status !== 'pending_acceptance') continue
          const act = rdb.findAnyActivity(inv.activityId)
          items.push({
            id: 'todo-inv-' + inv.id,
            type: 'invitation',
            title: '确认录取邀请',
            description: `${act?.clubName || '社团'} - ${act?.title || '招新活动'}`,
            deadline: inv.expiredAt,
            link: `/me/invitations/recruitment/${inv.id}`,
          })
        }
        for (const inv of rdb.jointInvitations) {
          if (inv.applicantId !== applicantId || inv.status !== 'pending_acceptance') continue
          const ja = rdb.findJoint(inv.jointId)
          items.push({
            id: 'todo-jinv-' + inv.id,
            type: 'invitation',
            title: '确认联合录取邀请',
            description: `${ja?.title || '联合招新活动'}`,
            deadline: inv.expiredAt,
            link: `/me/invitations/joint/${inv.id}`,
          })
        }
        // 面试时间确认（普通招新）：仅展示当前申请人待确认的面试
        for (const it of rdb.recruitmentInterviews) {
          if (it.applicantId !== applicantId || it.status !== 'pending_selection') continue
          const act = rdb.findAnyActivity(it.activityId)
          items.push({
            id: 'todo-interview-' + it.id,
            type: 'interview',
            title: '确认面试时间',
            description: `${act?.title || '招新活动'} · 面试时间待确认`,
            deadline: act?.deadline || '',
            link: '/me/schedule',
          })
        }
        for (const it of rdb.jointInterviews) {
          if (it.applicantId !== applicantId || it.status !== 'pending_selection') continue
          const ja = rdb.findJoint(it.jointId)
          items.push({
            id: 'todo-jinterview-' + it.id,
            type: 'interview',
            title: '确认联合面试时间',
            description: `${ja?.title || '联合招新活动'} · 面试时间待确认`,
            deadline: '',
            link: `/me/interviews/joint/${it.jointId}`,
          })
        }
      }
      // 被邀请人视角：常规入社邀请待处理
      const candidateId = actorCandidateId(user)
      if (candidateId) {
        const pending = db.membershipInvitations.find(
          (i) => i.candidateId === candidateId && (i.status === 'sent' || i.status === 'pending_acceptance')
        )
        if (pending) {
          items.unshift({
            id: 'todo-membership-' + pending.id,
            type: 'invitation',
            title: '处理常规入社邀请',
            description: '计算机协会' + (pending.departmentName ? ` · 加入「${pending.departmentName}」` : ''),
            deadline: pending.expiredAt,
            link: '/me/invitations/membership/' + pending.id,
          })
        }
      }
      return {
        code: 0,
        data: { items, nextCursor: null },
      }
    },
  },
  {
    url: '/api/me/ongoing',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const applicantId = applicantIdOfUrl(url)
      const recItems = (applicantId ? rdb.recruitmentApplications.filter((a) => a.applicantId === applicantId) : [])
        .map((a) => {
          const act = rdb.findAnyActivity(a.activityId)
          return {
            id: a.id, type: 'application', title: `招新报名：${act?.title || a.activityId}`,
            description: `${act?.clubName || ''} · ${a.status === 'identity_anomaly' ? '身份异常待处理' : a.status === 'revision_requested' ? '补充材料待处理' : '报名审核中'}`,
            submittedAt: a.submittedAt, link: `/activity/recruitment/${a.activityId}/apply`,
            activityId: a.activityId, status: a.status,
          }
        })
      const jointItems = (applicantId ? rdb.jointApplications.filter((a) => a.applicantId === applicantId) : [])
        .map((a) => {
          const ja = rdb.findJoint(a.jointId)
          return {
            id: a.id, type: 'joint', title: `联合报名：${ja?.title || a.jointId}`,
            description: '联合活动报名进行中',
            submittedAt: a.submittedAt, link: `/activity/joint/${a.jointId}/apply`,
            activityId: '', status: a.status,
          }
        })
      const items = [...recItems, ...jointItems].filter((i) => ['submitted', 'revision_requested', 'identity_anomaly'].includes(i.status))
      return {
        code: 0,
        data: { items, nextCursor: null },
      }
    },
  },
  {
    url: '/api/me/history',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const applicantId = applicantIdOfUrl(url)
      const recItems = (applicantId ? rdb.recruitmentApplications.filter((a) => a.applicantId === applicantId) : [])
        .filter((a) => ['exited', 'not_qualified'].includes(a.status))
        .map((a) => {
          const act = rdb.findAnyActivity(a.activityId)
          return {
            id: 'his-' + a.id,
            type: 'application',
            title: `${act?.clubName || ''} ${act?.title || a.activityId}`,
            result: a.status === 'not_qualified' ? '未通过' : '已退出',
            completedAt: a.withdrawnAt || a.submittedAt || '',
          }
        })
      return {
        code: 0,
        data: {
          items: recItems,
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/me/schedule',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const applicantId = applicantIdOfUrl(url)
      const me = resolveMockUser(url)
      const meId = me?.id || ''
      const items = (applicantId ? rdb.recruitmentInterviews.filter((i) => i.applicantId === applicantId) : [])
        .filter((i) => i.status === 'scheduled' || i.status === 'pending_selection')
        .map((i) => {
          const act = rdb.findAnyActivity(i.activityId)
          const slot = act?.rounds.flatMap((r) => r.slots).find((s) => s.id === i.slotId)
          return {
            id: i.id,
            title: i.roundId ? `第 ${i.roundId.replace('rd-', '')} 轮面试` : '面试',
            activityTitle: act?.title || i.activityId,
            time: slot?.startAt || i.startAt,
            location: '待定',
            interviewerName: i.interviewerIds.map((id) => mockUsers[id]?.name || '面试官').join('、') || '待定',
            status: i.status,
            role: 'applicant' as const,
            applicantName: '',
          }
        })
      const interviewerTasks = (meId ? rdb.recruitmentInterviews.filter((i) => i.interviewerIds.includes(meId)) : [])
        .filter((i) => i.status === 'scheduled' || i.status === 'in_progress' || i.status === 'leave' || i.status === 'late')
        .map((i) => {
          const act = rdb.findAnyActivity(i.activityId)
          const slot = act?.rounds.flatMap((r) => r.slots).find((s) => s.id === i.slotId)
          return {
            id: 't-' + i.id,
            title: i.roundId ? `第 ${i.roundId.replace('rd-', '')} 轮面试官任务` : '面试官任务',
            activityTitle: act?.title || i.activityId,
            time: slot?.startAt || i.startAt,
            location: '待定',
            interviewerName: '',
            status: i.status,
            role: 'interviewer' as const,
            applicantName: i.applicantName,
          }
        })
      return {
        code: 0,
        data: { items: [...items, ...interviewerTasks], nextCursor: null },
      }
    },
  },
]

/** 招新 + 联合活动处理器（有状态，数据源：src/mock/db-recruitment.ts） */

/** 成员生命周期处理器（有状态，数据源：src/mock/db.ts） */
const memberHandlers: MockMethod[] = [
  // 成员列表（静态路由必须排在动态 :memberId 之前）
  {
    url: '/api/org/:clubId/members',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      // 仅本社团成员可查看成员列表（普通成员多社团时按目标社团判定；非本社团成员 403）
      if (!canViewClubMembers(user, query.clubId)) return forbidden()
      const isManager = canManageMembers(user, query.clubId)
      const scope = departmentScopeFor(user, query.clubId)
      // MEM-004：任期到期提醒（派生投递，interval 桶去重——模拟时钟驱动，管理端拉取时交付）
      deliverTermEndReminders(query.clubId)
      const all = db.listMembers(query.clubId)
      const list = scope
        ? all.filter((m) => m.positions.some((p) => p.status === 'active' && p.departmentName === scope))
        : all
      const search = query.search
      const filtered = search
        ? list.filter((m) => m.name.includes(search) || m.studentId === search)
        : list
      const activeMembers = list.filter((m) => m.status === 'active')
      const exitedMembers = list.filter((m) => m.status === 'exited')
      const deptSource = scope ? db.departments.filter((d) => d.name === scope) : db.departments
      // MEM-004：任期提醒派生（memberId → 最近到期日 + 剩余天数），供列表红点/剩余天数透出
      const termEndByMember = new Map<string, { termEndAt: string; daysLeft: number }>()
      for (const u of db.upcomingTermEnd(query.clubId, platformConfig.termRemindDays)) {
        const end = u.position.plannedEndDate as string
        const cur = termEndByMember.get(u.memberId)
        if (!cur || end < cur.termEndAt) termEndByMember.set(u.memberId, { termEndAt: end, daysLeft: u.daysLeft })
      }
      const byDepartment = deptSource.map((d) => ({
        id: d.id,
        name: d.name,
        count: activeMembers.filter((m) => m.positions.some((p) => p.departmentId === d.id && p.status === 'active')).length,
      }))
      const zeroDeptCount = activeMembers.filter((m) => !m.positions.some((p) => p.status === 'active')).length
      // 管理待办仅管理角色可见；普通成员只读列表不暴露管理数据
      const pendingCounts = isManager ? {
        departmentApply: db.departmentApplications.filter((a) => a.clubId === query.clubId && a.status === 'under_review' && (!scope || a.targetDeptName === scope)).length,
        appointments: db.appointmentCommands.filter((c) => c.clubId === query.clubId && (c.status === 'pending_exec' || c.status === 'initiator_lost_rights' || c.status === 'reconfirmed') && (!scope || c.departmentName === scope)).length,
        transition: !scope && db.transitionState.candidates.length + db.transitionState.appointments.length > 0 && db.transitionState.executedAt === null ? 1 : 0,
      } : null
      return {
        code: 0,
        data: {
          items: filtered.map((m) => {
            const activePositions = m.positions.filter((p) => p.status === 'active')
            return {
              id: m.id, name: m.name, studentId: m.studentId,
              // 普通成员只读：不返回联系方式
              email: isManager ? m.email : null,
              phone: isManager ? m.phone : null,
              positions: activePositions.map((p) => ({
                departmentId: p.departmentId,
                departmentName: p.departmentName,
                title: p.title,
                status: p.status,
              })),
              department: activePositions.map((p) => p.departmentName).join(' + ') || '待分配',
              title: activePositions[0]?.title || '成员',
              status: m.status, joinedAt: m.joinedAt.slice(0, 10),
              exitedAt: m.exitedAt ? m.exitedAt.slice(0, 10) : null,
              termEndAt: termEndByMember.get(m.id)?.termEndAt ?? null,
              termDaysLeft: termEndByMember.get(m.id)?.daysLeft ?? null,
            }
          }),
          stats: {
            total: list.length,
            active: activeMembers.length,
            exited: exitedMembers.length,
            byDepartment,
            zeroDepartment: zeroDeptCount,
          },
          pendingCounts,
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/org/:clubId/members/department-apply',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const scope = departmentScopeFor(user, query.clubId)
      const list = db.departmentApplications.filter((a) => a.clubId === query.clubId && (!scope || a.targetDeptName === scope))
      return {
        code: 0,
        data: {
          items: list.map((a) => ({
            id: a.id, applicantId: a.applicantId, applicantName: a.applicantName,
            type: a.type, currentDept: a.currentDept,
            targetDeptId: a.targetDeptId, targetDeptName: a.targetDeptName,
            reason: a.reason, status: a.status, submittedAt: a.submittedAt,
            decidedAt: a.decidedAt, decidedBy: a.decidedBy, rejectReason: a.rejectReason,
          })),
          departments: db.departments,
          nextCursor: null,
        },
      }
    },
  },
  // 发起部门关系申请
  {
    url: '/api/org/:clubId/members/department-apply',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { type: string; targetDeptId: string; reason: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member) return forbidden()
      const active = member.positions.find((p) => p.status === 'active')
      const app = db.createDepartmentApplication(query.clubId, {
        applicantId: member.id, applicantName: member.name,
        type: (body.input?.type as 'join' | 'leave' | 'transfer') || 'join',
        currentDept: active?.departmentName || '-',
        targetDeptId: body.input?.targetDeptId,
        reason: body.input?.reason || '',
      })
      return { code: 0, data: { id: app.id, status: app.status, submittedAt: app.submittedAt } }
    },
  },
  // 撤回部门关系申请
  {
    url: '/api/org/:clubId/members/department-apply/:applicationId/withdraw',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const app = db.departmentApplications.find((a) => a.id === query.applicationId)
      if (!app) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '申请不存在', supportId: 'MOCK' } }
      const isApplicant = actor === app.applicantId
      if (!isApplicant && !canManageMembers(user, query.clubId)) return forbidden()
      // 撤回走 SM-MEM-003 状态机，与审批互斥：任一方先行，另一方必被拒绝
      const r = db.withdrawDepartmentApplication(query.applicationId, actor ?? '', !isApplicant)
      if (!r.ok) return { statusCode: 422, body: { code: 'IFC-ERR-006', message: r.error || '撤回失败', supportId: 'MOCK' } }
      return { code: 0, data: { id: r.app?.id, status: r.app?.status } }
    },
  },
  // 审批部门关系申请（批准/驳回）
  {
    url: '/api/org/:clubId/members/department-apply/:applicationId/decide',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { decision: string; rejectReason?: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      const scope = departmentScopeFor(user, query.clubId)
      if (!member || !canManageMembers(user, query.clubId)) return forbidden()
      const app = db.departmentApplications.find((a) => a.id === query.applicationId)
      if (!app) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '申请不存在', supportId: 'MOCK' } }
      if (scope && app.targetDeptName !== scope) return forbidden()
      const r = db.decideDepartmentApplication(query.applicationId, body.input?.decision === 'approve' ? 'approve' : 'reject', member.id, member.name, body.input?.rejectReason)
      if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: r.app?.id, status: r.app?.status } }
    },
  },
  // 执行部门关系申请（已批准→生效，含失败与重试）
  {
    url: '/api/org/:clubId/members/department-apply/:applicationId/execute',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembers(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      const app = db.departmentApplications.find((a) => a.id === query.applicationId)
      if (scope && app && app.targetDeptName !== scope) return forbidden()
      const r = db.executeDepartmentApplication(query.applicationId)
      if (!r.ok) {
        if (r.app) return { code: 0, data: { id: r.app.id, status: r.app.status, failed: true, message: r.error } }
        return businessError(r.error || '执行失败')
      }
      return { code: 0, data: { id: r.app?.id, status: r.app?.status, failed: false } }
    },
  },
  // 常规入社邀请列表（管理端）
  {
    url: '/api/org/:clubId/members/invite',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          items: db.membershipInvitations.filter((i) => i.clubId === query.clubId).map((i) => ({
            id: i.id, candidateId: i.candidateId, candidateName: i.candidateName, candidateStudentId: i.candidateStudentId,
            departmentId: i.departmentId, departmentName: i.departmentName,
            status: i.status, sentAt: i.sentAt, expiredAt: i.expiredAt, acceptedAt: i.acceptedAt, withdrawnAt: i.withdrawnAt,
          })),
          nextCursor: null,
        },
      }
    },
  },
  // 候选用户搜索（姓名连续子串/学号精确）
  {
    url: '/api/org/:clubId/members/invite/candidates',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const list = db.searchCandidates(query.clubId, query.search || '')
      return { code: 0, data: { items: list } }
    },
  },
  // 发送常规入社邀请
  {
    url: '/api/org/:clubId/members/invite',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { candidateId: string; departmentId: string | null; expireDays?: number } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member || !canManageMembersFull(user, query.clubId)) return forbidden()
      const r = db.createMembershipInvitation(query.clubId, {
        candidateId: body.input?.candidateId, departmentId: body.input?.departmentId || null,
        expireDays: body.input?.expireDays || 7, actorId: member.id, actorName: member.name,
      })
      if (!r.ok) return businessError(r.error || '发送失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status, sentAt: r.invitation?.sentAt } }
    },
  },
  // 撤回邀请
  {
    url: '/api/org/:clubId/members/invite/:invitationId/withdraw',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      const r = db.withdrawInvitation(query.invitationId)
      if (!r.ok) return businessError(r.error || '撤回失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status, withdrawnAt: r.invitation?.withdrawnAt } }
    },
  },
  // 被邀请人视角：我的常规入社邀请
  {
    url: '/api/me/invitations/membership',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      const candidateId = actorCandidateId(user)
      return {
        code: 0,
        data: {
          items: candidateId
            ? db.membershipInvitations.filter((i) => i.candidateId === candidateId).map((i) => ({
                id: i.id, clubId: i.clubId, clubName: '计算机协会', candidateName: i.candidateName,
                departmentId: i.departmentId, departmentName: i.departmentName,
                status: i.status, sentAt: i.sentAt, expiredAt: i.expiredAt, acceptedAt: i.acceptedAt,
              }))
            : [],
          nextCursor: null,
        },
      }
    },
  },
  // 被邀请人：单条入社邀请详情（路由参数化后的入口）
  {
    url: '/api/me/invitations/membership/:invitationId',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const candidateId = actorCandidateId(user)
      const inv = db.membershipInvitations.find((i) => i.id === query.invitationId)
      if (!inv) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '邀请不存在', supportId: 'MOCK' } }
      if (candidateId && inv.candidateId !== candidateId) return forbidden()
      return {
        code: 0,
        data: {
          id: inv.id,
          clubId: inv.clubId,
          clubName: '计算机协会',
          candidateId: inv.candidateId,
          candidateName: inv.candidateName,
          departmentId: inv.departmentId,
          departmentName: inv.departmentName,
          status: inv.status,
          sentAt: inv.sentAt,
          expiredAt: inv.expiredAt,
          acceptedAt: inv.acceptedAt,
        },
      }
    },
  },
  // 被邀请人：接受/拒绝邀请（整体接受不可拆分）
  {
    url: '/api/me/invitations/membership/:invitationId/respond',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { action: string } } }) => {
      const user = resolveMockUser(url)
      const candidateId = actorCandidateId(user)
      const inv = db.membershipInvitations.find((i) => i.id === query.invitationId)
      if (!inv) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '邀请不存在', supportId: 'MOCK' } }
      if (candidateId && inv.candidateId !== candidateId) return forbidden()
      const r = db.respondInvitation(query.invitationId, body.input?.action === 'accept' ? 'accept' : 'reject')
      if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status, acceptedAt: r.invitation?.acceptedAt } }
    },
  },
  // 被邀请人：Casdoor 回读确认（接受后生效）
  {
    url: '/api/me/invitations/membership/:invitationId/sync-confirm',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      const r = db.confirmInvitationSync(query.invitationId)
      if (!r.ok) return businessError(r.error || '确认失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status } }
    },
  },
  // 个人通知偏好（P1-009：真实落库，支持读取/保存；缺省全订阅）
  {
    url: '/api/me/notifications/preferences',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      return { code: 0, data: { preferences: listNotificationPreferences(user.id), savedAt: null } }
    },
  },
  {
    url: '/api/me/notifications/preferences',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      const user = resolveMockUser(url)
      const prefs = (body.input ?? body) as Record<string, unknown>
      for (const [kind, value] of Object.entries(prefs)) {
        if (kind in notificationTemplates && typeof value === 'boolean') {
          setNotificationPreference(user.id, kind, value)
        }
      }
      return { code: 0, data: { preferences: listNotificationPreferences(user.id), savedAt: new Date().toISOString() } }
    },
  },
  // 任命/调岗/免职：候选成员 + 预约命令列表
  {
    url: '/api/org/:clubId/members/appointments',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canAppointments(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      const clubRole = user.roles.find((r) => r.clubId === query.clubId)?.role
      // 任命层级（03-社团组织与权限）：人事不可任命负责人级职位，部门负责人仅本部门普通职位
      const titles = scope ? ['干事'] : clubRole === 'hr' ? ['干事', '副部长', '部长'] : ['干事', '副部长', '部长', '副负责人']
      const all = db.listMembers(query.clubId)
      const candidates = scope
        ? all.filter((m) => m.positions.some((p) => p.status === 'active' && p.departmentName === scope))
        : all
      // MEM-003：组合任命支持非成员候选人（cand 档案，含历史成员前前任期）
      const picked = db.searchAppointmentCandidates(query.clubId, query.search || '')
      const nonMemberItems = picked.nonMembers.map((c) => ({
        id: c.id, name: c.name, studentId: c.studentId,
        department: '-', title: '-', status: 'candidate' as const,
        isMember: false, previousMemberId: c.previousMemberId,
      }))
      return {
        code: 0,
        data: {
          items: [ // 在职成员
            ...candidates
              .filter((m) => m.status === 'active')
              .map((m) => {
                const active = m.positions.find((p) => p.status === 'active')
                return { id: m.id, name: m.name, studentId: m.studentId, department: active?.departmentName || '-', title: active?.title || '成员', status: m.status, isMember: true, previousMemberId: null as string | null }
              }),
          ],
          candidates: nonMemberItems,
          departments: scope ? db.departments.filter((d) => d.name === scope) : db.departments,
          titles,
          commands: db.appointmentCommands.filter((c) => c.clubId === query.clubId && (!scope || c.departmentName === scope)).map((c) => ({
            id: c.id, action: c.action, memberId: c.memberId, memberName: c.memberName,
            departmentId: c.departmentId, departmentName: c.departmentName, title: c.title,
            scheduledAt: c.scheduledAt, status: c.status, createdAt: c.createdAt, createdBy: c.createdBy,
            executedAt: c.executedAt, failReason: c.failReason,
          })),
        },
      }
    },
  },
  // 发起任命/调岗/免职（立即或预约）
  {
    url: '/api/org/:clubId/members/appointments',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { action: string; memberId: string; departmentId: string | null; title: string | null; scheduledAt: string | null; candidateStudentId?: string | null } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member || !canAppointments(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      const clubRole = user.roles.find((r) => r.clubId === query.clubId)?.role
      const candidateStudentId = body.input?.candidateStudentId || null
      const target = db.findMember(query.clubId, body.input?.memberId)
      // MEM-003：非成员组合任命——目标为无成员记录的候选人（按学号定位档案，含历史成员重新加入）
      let targetName = target?.name || ''
      if (!target) {
        if (body.input?.action !== 'appoint' || !candidateStudentId) return businessError('目标成员不存在')
        const candidate = db.candidates.find((c) => c.studentId === candidateStudentId && !c.isMember)
        if (!candidate) return businessError('目标候选人不存在，请先在档案库中确认')
        targetName = candidate.name
      }
      if (target && scope) {
        const inScope = target.positions.some((p) => p.status === 'active' && p.departmentName === scope)
        if (!inScope) return forbidden()
        if (body.input?.title && body.input.title !== '干事') return businessError('部门负责人仅可任命普通职位')
      }
      // 部门负责人仅可任命本部门普通职位；非成员任命（无本部门关系）不予授权
      if (scope && !target && body.input?.title && body.input.title !== '干事') return businessError('部门负责人仅可任命普通职位')
      // 人事管理员只能在正式换届流程中确认负责人变更，不得通过任命命令产生负责人级职位
      if (clubRole === 'hr' && body.input?.title && ['负责人', '副负责人'].includes(body.input.title)) {
        return businessError('人事管理员不能任命负责人级职位')
      }
      const r = db.createAppointmentCommand(query.clubId, {
        action: body.input?.action as 'appoint' | 'transfer' | 'dismiss',
        memberId: target?.id || (candidateStudentId ? `cand-new:${candidateStudentId}` : ''),
        memberName: targetName,
        departmentId: body.input?.departmentId || null,
        departmentName: db.departments.find((d) => d.id === body.input?.departmentId)?.name || null,
        title: body.input?.title || null,
        scheduledAt: body.input?.scheduledAt || null,
        actorName: member.name,
        candidateStudentId,
      })
if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: r.command?.id, status: r.command?.status } }
    },
  },
  // 取消预约命令
  {
    url: '/api/org/:clubId/members/appointments/:commandId/cancel',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canAppointments(user, query.clubId)) return forbidden()
      const r = db.cancelAppointmentCommand(query.commandId)
      if (!r.ok) return businessError(r.error || '取消失败')
      return { code: 0, data: { id: query.commandId, status: 'cancelled' } }
    },
  },
  // 重新确认预约命令
  {
    url: '/api/org/:clubId/members/appointments/:commandId/reconfirm',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { scheduledAt?: string } } }) => {
      const user = resolveMockUser(url)
      if (!canAppointments(user, query.clubId)) return forbidden()
      const r = db.reconfirmAppointmentCommand(query.commandId, body.input?.scheduledAt || new Date().toISOString())
      if (!r.ok) return businessError(r.error || '重新确认失败')
      return { code: 0, data: { id: query.commandId, status: 'reconfirmed' } }
    },
  },
  // 执行预约命令
  {
    url: '/api/org/:clubId/members/appointments/:commandId/execute',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canAppointments(user, query.clubId)) return forbidden()
      const r = db.executeAppointmentCommand(query.commandId)
      if (!r.ok) {
        if (r.command) return { code: 0, data: { id: r.command.id, status: r.command.status, failed: true, message: r.error } }
        return businessError(r.error || '执行失败')
      }
      return { code: 0, data: { id: r.command?.id, status: r.command?.status, failed: false } }
    },
  },
  // 辞职申请列表（含审批）；逾期标记为派生字段，审批人视角可甄别待办
  {
    url: '/api/org/:clubId/members/resignation',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canApproveResignation(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      return {
        code: 0,
        data: {
          items: db.resignationRequests.filter((r) => r.clubId === query.clubId && (!scope || r.departmentName === scope))
            .map((r) => ({ ...r, overdue: db.isProcessingOverdue(r.status, r.dueAt, ['under_review']) })),
          nextCursor: null,
        },
      }
    },
  },
  // 提交辞职申请
  {
    url: '/api/org/:clubId/members/resignation',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { reason: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member) return forbidden()
      if (!body.input?.reason?.trim()) {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-006',
            message: '辞职必须填写原因',
            fieldErrors: { reason: ['请填写辞职原因'] },
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          },
        }
      }
      const active = member.positions.find((p) => p.status === 'active')
      const req = db.createResignationRequest(query.clubId, member.id, member.name, active?.departmentName || '-', active?.title || '成员', body.input?.reason || '')
      return { code: 0, data: { id: req.id, status: req.status, submittedAt: req.submittedAt } }
    },
  },
  // 审批辞职申请
  {
    url: '/api/org/:clubId/members/resignation/:requestId/decide',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { decision: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member || !canApproveResignation(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      const req = db.resignationRequests.find((r) => r.id === query.requestId)
      if (scope && req && req.departmentName !== scope) return forbidden()
      const decision = body.input?.decision === 'approve' ? 'approve' : 'reject'
      const r = db.decideResignationRequest(query.requestId, decision, member.name)
      if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: query.requestId, status: decision === 'approve' ? 'approved' : 'rejected' } }
    },
  },
  // 撤回辞职申请（成员本人，仅审批前，MEM-002）
  {
    url: '/api/org/:clubId/members/resignation/:requestId/withdraw',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      if (!actor) return forbidden()
      const r = db.withdrawResignationRequest(query.requestId, actor)
      if (!r.ok) return businessError(r.error || '撤回失败')
      return { code: 0, data: { id: query.requestId, status: 'withdrawn' } }
    },
  },
  // 成员退出与移除（管理端 / 成员自视角）——含主动退出申请与辞职申请（逾期标记）
  {
    url: '/api/org/:clubId/members/exit',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const isManager = canManageMembers(user, query.clubId)
      const scope = departmentScopeFor(user, query.clubId)
      if (!isManager && !actor) return forbidden()
      // 普通成员自视角：仅返回本人信息、本人退出申请、本人辞职申请（可撤回/可二次确认）
      const selfOnly = !isManager
      const base = db.listMembers(query.clubId)
      // MRM-006：已退出（含被移除）成员不再出现在任何列表
      const list = (selfOnly ? base.filter((m) => m.id === actor) : base).filter(
        (m) => m.status !== 'exited' && (!scope || m.positions.some((p) => p.departmentName === scope)),
      )
      const exitList = isManager
        ? (scope ? [] : db.listExitRequests(query.clubId))
        : db.exitRequestsOfMember(query.clubId, actor ?? '')
      const resignationList = (isManager
        ? db.resignationRequests.filter((r) => r.clubId === query.clubId && (!scope || r.departmentName === scope))
        : db.resignationRequestsOfMember(query.clubId, actor ?? ''))
      return {
        code: 0,
        data: {
          items: list.map((m) => {
            const active = m.positions.find((p) => p.status === 'active')
            return {
              id: m.id, name: m.name, studentId: m.studentId,
              department: active?.departmentName || '-', title: active?.title || '成员',
              status: m.status, joinedAt: m.joinedAt.slice(0, 10),
              exitedAt: m.exitedAt ? m.exitedAt.slice(0, 10) : null,
            }
          }),
          resignations: resignationList.map((r) => ({
            id: r.id, memberId: r.memberId, memberName: r.memberName,
            departmentName: r.departmentName, title: r.title, reason: r.reason,
            status: r.status, submittedAt: r.submittedAt, decidedAt: r.decidedAt, decidedBy: r.decidedBy,
            dueAt: r.dueAt,
            overdue: db.isProcessingOverdue(r.status, r.dueAt, ['under_review']),
            withdrawAvailable: r.memberId === actor && r.status === 'under_review',
          })),
          exitRequestsWithFlags: exitList.map((r) => ({
            id: r.id, clubId: r.clubId, memberId: r.memberId, memberName: r.memberName,
            reason: r.reason, status: r.status, submittedAt: r.submittedAt,
            decidedAt: r.decidedAt, decidedBy: r.decidedBy, confirmedAt: r.confirmedAt, dueAt: r.dueAt,
            overdue: db.isProcessingOverdue(r.status, r.dueAt, ['under_review', 'approved']),
            canWithdraw: r.memberId === actor && r.status === 'under_review',
            canConfirm: r.memberId === actor && r.status === 'approved',
          })),
          nextCursor: null,
        },
      }
    },
  },
  // 移除成员 / 标记退出（管理员）——按 action 区分语义：
  //   remove：硬移除（SM-MEM-001 active→exiting→exited，结束职位 + 通知「被移出」，MEM-006）；P1-011 高风险命令 member_remove：重认证 + 原因 + 审计
  //   mark_exit：软退出（仅记 exitedAt，保留职位档案，无「被移出」通知，无需重认证）
  {
    url: '/api/org/:clubId/members/exit',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { memberId: string; action?: string; reason?: string; reauthProof?: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      if (!actor || !canManageMembers(user, query.clubId)) return forbidden(url)
      const memberId = body.input?.memberId
      const action = body.input?.action === 'mark_exit' ? 'mark_exit' : 'remove'
      if (!body.input?.reason?.trim()) return businessError(action === 'mark_exit' ? '标记退出必须填写原因' : '移除成员必须填写原因')
      const member = db.findMember(query.clubId, memberId)
      if (!member) return businessError('成员不存在')
      if (member.status === 'exited') return businessError('该成员已退出，无需重复操作')
      const scope = departmentScopeFor(user, query.clubId)
      if (scope && !member.positions.some((p) => p.departmentName === scope)) return forbidden(url)
      if (action === 'mark_exit') {
        // 标记退出：软退出，保留档案；不通知「被移出」
        const res = db.markMemberExit(query.clubId, actor, memberId)
        if (!res.ok) return businessError(res.error || '标记退出失败')
        return { code: 0, data: { memberId, action, status: res.member?.status } }
      }
      // 硬移除（remove）为 P1-011 高风险命令：重认证门禁（proof 一次性消费 + 原因 ≥ 5 字）
      const gate = assertHighRisk('member_remove', body.input, user?.id)
      if (gate) return gate
      const res = db.directRemoveMember(query.clubId, actor, memberId)
      if (!res.ok) return businessError(res.error || '移除失败')
      writeAuditLog({
        actorName: user.name,
        action: '移除成员',
        targetType: '成员',
        targetId: memberId,
        detail: `移除成员 ${member.name}（${body.input?.reason?.trim()}）`,
        scope: 'org',
      })
      // 通知被移除成员（member 通知族）
      const removedUserId = userIdOfMember(memberId)
      if (removedUserId) pushNotification([removedUserId], 'member', { body: `您已被移出「计算机协会」，原因：${body.input.reason}` }, { clubId: query.clubId })
      return { code: 0, data: { memberId, action, status: res.member?.status } }
    },
  },
  // 主动退出申请（成员自发起，MEM-001）：进入审批队列，待负责人/人事批准
  {
    url: '/api/org/:clubId/members/exit-requests',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { reason: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member) return forbidden()
      if (member.status !== 'active') return businessError('仅在职成员可申请退出')
      if (!body.input?.reason?.trim()) {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-006', message: '退出必须填写原因',
            fieldErrors: { reason: ['请填写退出原因'] },
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          },
        }
      }
      const r = db.createExitRequest(query.clubId, { memberId: member.id, memberName: member.name, reason: body.input.reason, allowSelfExit: platformConfig.allowSelfExit })
      if (!r.ok) return businessError(r.error || '发起退出申请失败')
      return { code: 0, data: { id: r.request?.id, status: r.request?.status, submittedAt: r.request?.submittedAt, dueAt: r.request?.dueAt } }
    },
  },
  // 审批退出申请（负责人/人事）；批准后成员进入 exiting、结束全部职位，等待本人二次确认
  {
    url: '/api/org/:clubId/members/exit-requests/:requestId/decide',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { decision: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      // 退出审批仅负责人/人事，部门负责人无权（与辞职审批区分）
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      if (!member) return forbidden()
      const req = db.exitRequests.find((r) => r.id === query.requestId)
      if (!req || req.clubId !== query.clubId) return businessError('申请不存在')
      const decision = body.input?.decision === 'approve' ? 'approve' : 'reject'
      const r = db.decideExitRequest(query.requestId, decision, { id: member.id, name: member.name })
      if (!r.ok) return businessError(r.error || '操作失败')
      const applicantUid = userIdOfMember(req.memberId)
      if (applicantUid) {
        pushNotification(
          [applicantUid], 'member',
          { body: decision === 'approve' ? '您的退出申请已批准，请登录后在个人中心完成二次确认' : '您的退出申请已被驳回' },
          { clubId: query.clubId },
        )
      }
      return { code: 0, data: { id: query.requestId, status: decision === 'approve' ? 'approved' : 'rejected' } }
    },
  },
  // 成员本人撤回退出申请（仅审批前；审批后经审批人处理）
  {
    url: '/api/org/:clubId/members/exit-requests/:requestId/withdraw',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      if (!actor) return forbidden()
      const r = db.withdrawExitRequest(query.requestId, actor)
      if (!r.ok) return businessError(r.error || '撤回失败')
      return { code: 0, data: { id: query.requestId, status: 'withdrawn' } }
    },
  },
  // 成员本人二次确认：approved → 正式离社（SM-MEM-001 exiting → exited）
  {
    url: '/api/org/:clubId/members/exit-requests/:requestId/confirm',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user, query.clubId)
      if (!actor) return forbidden()
      const r = db.confirmExitRequest(query.requestId, actor)
      if (!r.ok) return businessError(r.error || '确认失败')
      return { code: 0, data: { id: query.requestId, status: 'exited', confirmedAt: r.request?.confirmedAt } }
    },
  },
  // 换届信息（可编辑方案 + 执行结果）
  {
    url: '/api/org/:clubId/members/transition',
    method: 'get',
    response: () => {
      const t = db.transitionState
      return {
        code: 0,
        data: {
          currentLeader: t.currentLeader,
          candidates: t.candidates,
          appointments: t.appointments,
          canExecute: t.candidates.length + t.appointments.length > 0 && t.executedAt === null,
          executedAt: t.executedAt,
          results: t.results,
          syncFailures: t.syncFailures,
          failOn: t.failOn,
        },
      }
    },
  },
  // 保存换届方案
  {
    url: '/api/org/:clubId/members/transition/plan',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { candidates?: { memberId: string; name: string; currentTitle: string; proposedTitle: string; department: string }[]; appointments?: { memberId: string; name: string; currentTitle: string; proposedTitle: string; department: string }[] } } }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      if (body.input?.candidates) db.transitionState.candidates = body.input.candidates
      if (body.input?.appointments) db.transitionState.appointments = body.input.appointments
      return { code: 0, data: { saved: true } }
    },
  },
  // 执行换届（P1-011 高风险命令 transition_execute：重认证 + 原因 + 审计）
  {
    url: '/api/org/:clubId/members/transition',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input?: { reason?: string; reauthProof?: string } } }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden(url)
      const gate = assertHighRisk('transition_execute', body.input, user?.id)
      if (gate) return gate
      const t = db.transitionState
      if (t.executedAt) return businessError('换届已执行，请勿重复提交')
      if (t.candidates.length + t.appointments.length === 0) return businessError('无职位变化，无需执行换届')
      const results: { memberId: string; name: string; action: string; targetTitle: string; success: boolean; message: string }[] = []
      const partialFail = t.failOn === 'partial' && t.results.length === 0
      for (const c of t.candidates) {
        const success = !(partialFail && c.memberId === 'mem-002' && results.length >= 1)
        results.push({ memberId: c.memberId, name: c.name, action: 'promote', targetTitle: c.proposedTitle, success, message: success ? '已生效' : '新任写入失败，已撤回新增' })
      }
      for (const a of t.appointments) {
        const success = true
        results.push({ memberId: a.memberId, name: a.name, action: 'promote', targetTitle: a.proposedTitle, success, message: success ? '已生效' : '写入失败' })
      }
      t.results = results
      t.executedAt = new Date().toISOString()
      t.syncFailures = []
      // 至少保留一名负责人：candidates 中的"负责人"全部成功后旧任保留
      const leaderCandidate = results.find((r) => r.targetTitle === '负责人')
      if (leaderCandidate && leaderCandidate.success) {
        const old = db.findMember(query.clubId, t.currentLeader.id)
        if (old) {
          const pos = old.positions.find((p) => p.status === 'active')
          if (pos) { pos.endDate = new Date().toISOString().slice(0, 10); pos.status = 'ended' }
          old.status = 'exited'
          old.exitedAt = new Date().toISOString()
          // ORG-001/017：换届同步——旧任退出负责人职位 Group，新任加入
          const oldSync = orgdb.syncPositionMembership({ clubId: query.clubId, memberId: old.id, memberName: old.name, departmentName: pos?.departmentName ?? null, title: '负责人', active: false })
          if (!oldSync.ok && oldSync.error) t.syncFailures.push({ memberId: old.id, memberName: old.name, title: '负责人', active: false, error: oldSync.error })
          t.currentLeader = { id: leaderCandidate.memberId, name: leaderCandidate.name, title: leaderCandidate.targetTitle }
        }
        const newSync = orgdb.syncPositionMembership({ clubId: query.clubId, memberId: leaderCandidate.memberId, memberName: leaderCandidate.name, departmentName: null, title: '负责人', active: true })
        if (!newSync.ok && newSync.error) t.syncFailures.push({ memberId: leaderCandidate.memberId, memberName: leaderCandidate.name, title: '负责人', active: true, error: newSync.error })
      }
      writeAuditLog({
        actorName: user.name,
        action: '执行换届',
        targetType: '换届',
        targetId: query.clubId,
        detail: `社团 ${query.clubId} 换届执行：${results.filter((r) => r.success).length} 成功 / ${results.filter((r) => !r.success).length} 失败（${body.input?.reason?.trim()}）`,
        scope: 'org',
      })
      return { code: 0, data: { executedAt: t.executedAt, results, finishedAt: null, syncFailures: t.syncFailures } }
    },
  },
  // 换届失败项重试
  {
    url: '/api/org/:clubId/members/transition/retry',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      const t = db.transitionState
      if (!t.executedAt) return businessError('换届尚未执行')
      let changed = false
      t.results = t.results.map((r) => {
        if (!r.success) {
          changed = true
          return { ...r, success: true, message: '重试后已生效' }
        }
        return r
      })
      if (!changed) return businessError('没有失败项需要重试')
      return { code: 0, data: { results: t.results } }
    },
  },
  // 成员详情（动态 :memberId 必须放在所有静态子路由之后）
  {
    url: '/api/org/:clubId/members/:memberId',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      // 仅本社团成员可查看成员详情（普通成员多社团时按目标社团判定；非本社团成员 403）
      if (!canViewClubMembers(user, query.clubId)) return forbidden()
      const member = db.getMemberProfile(query.clubId, query.memberId)
      if (!member) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '成员不存在', supportId: 'MOCK' } }
      const scope = departmentScopeFor(user, query.clubId)
      if (scope && !member.positions.some((p) => p.departmentName === scope)) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '成员不存在', supportId: 'MOCK' } }
      }
      const isManager = canManageMembers(user, query.clubId)
      return {
        code: 0,
        data: {
          id: member.id, clubId: member.clubId, studentId: member.studentId,
          name: member.name,
          // 普通成员只读：不返回联系方式
          email: isManager ? member.email : null,
          phone: isManager ? member.phone : null,
          status: member.status, joinedAt: member.joinedAt, exitedAt: member.exitedAt,
          positions: member.positions,
          tenures: member.tenures,
          departmentHistory: member.departmentHistory,
          anomalies: member.anomalies,
          // MEM-007：历史成员分段（同学生账号的过往经历，供"重新加入"时间线还原）
          historyMemberships: db.historyMembershipsOf(query.clubId, member.studentId, member.id),
        },
      }
    },
  },
]

/** 支撑与平台处理器 */
const platformHandlers: MockMethod[] = [
  // 社团接入管理（US-ORG-01/03：仅超管，数据来自 db-organization，状态机 SM-ORG-001 校验）
  {
    url: '/api/admin/clubs',
    method: 'get',
response: ({ url }: { url: string }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const items = orgdb.listClubAccesses().map((c) => ({ ...c, hasActiveBusiness: hasActiveBusinessFor(c.clubId) }))
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // Group→权限模板映射查询（P1-005：按社团查询已建立的映射关系）
  {
    url: '/api/admin/clubs/:clubId/template-mappings',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      return { code: 0, data: { items: orgdb.getTemplateMappings(query.clubId) } }
    },
  },
  // Group 目录（接入向导候选：SM-ORG-001 唯一 Group 数据源，仅暴露社团级候选，不泄露内部职位/部门层级）
  {
    url: '/api/admin/groups',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      return { code: 0, data: { items: orgdb.listGroups().filter((g) => g.purpose === 'club') } }
    },
  },
  // Group 分层搜索（精确 → 中文连续子串 → 受控错别字近似，3 有效字符门槛）
  {
    url: '/api/admin/groups/search',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      return { code: 0, data: { items: orgdb.searchGroups(query.q || ''), threshold: 3 } }
    },
  },
  // Group 详情（含已有成员与负责人职位 Group）
  {
    url: '/api/admin/groups/:groupId',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const detail = orgdb.getGroupDetail(query.groupId)
      if (!detail) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: 'Group 不存在' } }
      return { code: 0, data: detail }
    },
  },
  // 接入向导：保存步骤（save_step）
  {
    url: '/api/admin/clubs/wizard/save-step',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { clubId?: string; step?: number; selectedGroupId?: string | null; leaderGroupId?: string | null; email?: string; deptGroups?: string[]; roleGroups?: string[]; leaderRoleGroup?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const input = body.input || {}
      if (!input.clubId) return businessError('缺少社团 ID')
      const email = (input.email ?? '').trim()
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return businessError('联系邮箱格式不正确')
      const result = orgdb.saveWizardStep(input.clubId, {
        step: input.step ?? 0,
        selectedGroupId: input.selectedGroupId,
        leaderGroupId: input.leaderGroupId,
        email,
        deptGroups: input.deptGroups,
        roleGroups: input.roleGroups,
        leaderRoleGroup: input.leaderRoleGroup,
      })
      if (!result.ok) return businessError(result.error || '保存失败')
      return { code: 0, data: result.data }
    },
  },
  // 接入向导：完成校验并启用（complete_validation）
  {
    url: '/api/admin/clubs/wizard/complete',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { clubId?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const input = body.input || {}
      if (!input.clubId) return businessError('缺少社团 ID')
      const result = orgdb.completeWizard(input.clubId)
      if (!result.ok) return businessError(result.error || '接入失败')
      return { code: 0, data: result.data }
    },
  },
  // 成员导入（接入时已有成员成为当前关系）
  {
    url: '/api/admin/clubs/:clubId/import',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { memberIds?: string[] } } }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const result = orgdb.importMembers(query.clubId, body.input?.memberIds || [])
      if (!result.ok) return businessError(result.error || '导入失败')
      return { code: 0, data: result.data }
    },
  },
  // 普通停用（进行中业务阻止）
  {
    url: '/api/admin/clubs/:clubId/normal-suspend',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { reason?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const result = orgdb.suspendClub(query.clubId, 'normal', body.input?.reason || '', { hasActiveBusiness: hasActiveBusinessFor(query.clubId) })
      if (!result.ok) return businessError(result.error || '停用失败')
      return { code: 0, data: result.data }
    },
  },
  // 紧急停用（P1-011 高风险命令 club_force_suspend：只读 + 期限暂停，重认证 + 原因 + 审计）
  {
    url: '/api/admin/clubs/:clubId/force-suspend',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { reason?: string; reauthProof?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden(url)
      const gate = assertHighRisk('club_force_suspend', body.input, resolveMockUser(url)?.id)
      if (gate) return gate
      const result = orgdb.suspendClub(query.clubId, 'force', body.input?.reason || '', { hasActiveBusiness: false })
      if (!result.ok) return businessError(result.error || '紧急停用失败')
      writeAuditLog({
        actorName: resolveMockUser(url).name,
        action: '紧急停用社团',
        targetType: '社团',
        targetId: query.clubId,
        detail: `紧急停用（只读 + 期限暂停）：${body.input?.reason?.trim()}`,
        scope: 'platform',
      })
      return { code: 0, data: result.data }
    },
  },
  // 恢复启用（按停用时长一次性顺延冻结期限）
  {
    url: '/api/admin/clubs/:clubId/recover',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const result = orgdb.recoverClub(query.clubId)
      if (!result.ok) return businessError(result.error || '恢复失败')
      return { code: 0, data: result.data }
    },
  },
  // 解除接入（P1-011 高风险命令 club_disconnect：普通角色失权进入待重新接入；重认证 + 原因 + 审计）
  {
    url: '/api/admin/clubs/:clubId/disconnect',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input?: { reason?: string; reauthProof?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden(url)
      const gate = assertHighRisk('club_disconnect', body.input, resolveMockUser(url)?.id)
      if (gate) return gate
      const result = orgdb.disconnectClub(query.clubId)
      if (!result.ok) return businessError(result.error || '解除接入失败')
      writeAuditLog({
        actorName: resolveMockUser(url).name,
        action: '解除接入',
        targetType: '社团',
        targetId: query.clubId,
        detail: `解除接入，普通角色失权进入待重新接入：${body.input?.reason?.trim()}`,
        scope: 'platform',
      })
      return { code: 0, data: result.data }
    },
  },
  // 修复原 Group（统一先进入已停用，PRD-OPT-041）
  {
    url: '/api/admin/clubs/:clubId/repair',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const result = orgdb.repairGroup(query.clubId)
      if (!result.ok) return businessError(result.error || '修复失败')
      return { code: 0, data: result.data }
    },
  },
  // 重新绑定新 Group（统一先进入已停用）
  {
    url: '/api/admin/clubs/:clubId/rebind',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { groupId?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const result = orgdb.rebindClub(query.clubId, body.input?.groupId || '')
      if (!result.ok) return businessError(result.error || '重新绑定失败')
      return { code: 0, data: result.data }
    },
  },
  // 从待重新接入状态重新接入
  {
    url: '/api/admin/clubs/:clubId/reaccess',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { groupId?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const result = orgdb.reaccessClub(query.clubId, body.input?.groupId || '')
      if (!result.ok) return businessError(result.error || '重新接入失败')
      return { code: 0, data: result.data }

    },
  },
  // 统一身份对账（P2-015 闭环调用方）：模拟平台侧检测到成员在统一身份认证侧
  // 发生外部变更（转专业/退宿/跨部门调整等），逐成员调用 triggerMemberExternalChange
  // 登记数据异常——成员详情页「数据异常」块由此获得真实数据源，可经事实纠错处置。
  // 幂等：去重窗口内同类异常不重复登记（registered=false）；重复调用返回已登记记录，不膨胀数据。
  {
    url: '/api/admin/clubs/:clubId/reconcile',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const members = db.listMembers(query.clubId).filter((m) => m.status === 'active')
      if (members.length === 0) return businessError('该社团暂无可对账的活跃成员')
      const now = new Date().toISOString()
      const triggered: { memberId: string; memberName: string; kind: string; registered: boolean; anomalyId: string | null; createdAt: string | null }[] = []
      for (const m of members) {
        const r = db.triggerMemberExternalChange(query.clubId, m.id, 'external_change')
        triggered.push({
          memberId: m.id,
          memberName: m.name,
          kind: r.ok ? 'external_change' : String(r.error),
          registered: r.registered ?? false,
          anomalyId: r.anomaly?.id ?? null,
          createdAt: r.anomaly?.createdAt ?? null,
        })
      }
      const registered = triggered.filter((t) => t.registered).length
      writeAuditLog({
        actorName: resolveMockUser(url).name,
        action: '执行成员统一身份对账',
        targetType: '社团',
        targetId: query.clubId,
        detail: `检查 ${members.length} 名活跃成员，新登记外部变更异常 ${registered} 条，幂等跳过 ${triggered.length - registered} 条`,
        scope: 'platform',
      })
      return {
        code: 0,
        data: {
          clubId: query.clubId,
          checked: members.length,
          registered,
          deduped: triggered.length - registered,
          at: now,
          triggered,
        },
      }
    },
  },
  // 表单设计器（SM-FORM-001：编辑态取最新草稿，无草稿回退最新已发布版本）
  {
    url: '/api/org/:clubId/forms/designer/:formId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const result = formdb.getDesignerState(query.formId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  // 表单设计器发布（SM-FORM-001 draft --publish--> published）
  {
    url: '/api/org/:clubId/forms/designer/:formId/publish',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: { version?: number } } }) => {
      const result = formdb.publishForm(query.formId, Number(body.input?.version) || 1)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  // 表单停用（SM-FORM-001 published --deprecate--> deprecated）
  {
    url: '/api/org/:clubId/forms/designer/:formId/deprecate',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      const result = formdb.deprecateForm(query.formId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  // 表单复用（SM-FORM-001 deprecated --reuse--> draft）
  {
    url: '/api/org/:clubId/forms/designer/:formId/reuse',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      const result = formdb.reuseForm(query.formId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  // 表单克隆（SM-FORM-001 published|deprecated --clone--> draft，生成独立草稿）
  {
    url: '/api/org/:clubId/forms/designer/:formId/clone',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: { title?: string } } }) => {
      const result = formdb.cloneForm(query.formId, body.input?.title)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  // 邮件配置（P1-009：真实存储；未通过测试不可保存 —— US-NTF-02）
  {
    url: '/api/org/:clubId/notifications/email-config',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:config:manage')) return forbidden()
      const cfg = getEmailConfig(emailConfigKey('club', query.clubId))
      return {
        code: 0,
        data: {
          smtpHost: cfg.smtpHost, smtpPort: cfg.smtpPort, smtpUser: cfg.smtpUser,
          fromName: cfg.fromName, encryption: cfg.encryption, verified: cfg.verified,
          lastTestPassedAt: cfg.lastTestPassedAt, keyRotatedAt: cfg.keyRotatedAt,
        },
      }
    },
  },
  // 保存邮件配置（未测试通过 → 拒绝保存并提示先测试）
  {
    url: '/api/org/:clubId/notifications/email-config',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: Record<string, unknown> } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:config:manage')) return forbidden()
      const key = emailConfigKey('club', query.clubId)
      const input = (body.input ?? body) as Partial<{ smtpHost: string; smtpPort: number; smtpUser: string; fromName: string; encryption: string }>
      const result = saveEmailConfig(key, {
        smtpHost: String(input.smtpHost ?? ''),
        smtpPort: Number(input.smtpPort) || 465,
        smtpUser: String(input.smtpUser ?? ''),
        fromName: String(input.fromName ?? ''),
        encryption: (['ssl', 'tls', 'none'].includes(String(input.encryption)) ? String(input.encryption) : 'ssl') as 'ssl' | 'tls' | 'none',
      })
      if (!result.ok) {
        return { statusCode: 422, body: { code: 'IFC-ERR-006', message: '发信配置未通过测试，请先发送测试邮件', supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` } }
      }
      return { code: 0, data: { ...result.config, savedAt: new Date().toISOString() } }
    },
  },
  // 测试邮件配置（通过后标记 verified）
  {
    url: '/api/org/:clubId/notifications/email-config/test',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:config:manage')) return forbidden()
      const key = emailConfigKey('club', query.clubId)
      const cfg = markEmailTestPassed(key)
      return { code: 0, data: { status: 'sent', sentAt: cfg.lastTestPassedAt, to: user.email ?? cfg.smtpUser } }
    },
  },
  // 保存社团配置
  {
    url: '/api/org/:clubId/config',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, version: 2, savedAt: new Date().toISOString() } }
    },
  },
  // 批量候选列表（受控批量：仅限 club:batch:execute 权限，复用招新申请里可在本批次执行的对象）
  {
    url: '/api/org/:clubId/batch/candidates',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:batch:execute')) return forbidden()
      const items = rdb.recruitmentApplications
        .filter((a) => a.clubId === query.clubId && ['submitted', 'revision_requested'].includes(a.status))
        .map((a) => ({
          id: a.applicantId,
          name: a.applicantName,
          studentId: a.studentId,
          department: a.preferences[0]?.departmentName || '-',
          status: a.status,
        }))
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 批量操作面试官候选（assign_interviewer 目标选择）
  {
    url: '/api/org/:clubId/batch/interviewers',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:batch:execute')) return forbidden()
      const items = Object.values(mockUsers)
        .filter((u) => u.roles.some((r) => r.clubId === query.clubId && (r.permissions.includes('club:interview:view') || r.permissions.includes('club:recruitment:view'))))
        .map((u) => ({ id: u.id, name: u.name }))
      return { code: 0, data: { items } }
    },
  },
  // 批量操作执行（P1-011 高风险命令 batch_execute：重认证 + 原因 + 审计；鉴权 + 确定性逐项结果）
  {
    url: '/api/org/:clubId/batch/execute',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { memberIds: string[]; action: string; interviewerId?: string; reason?: string; reauthProof?: string } } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:batch:execute')) return forbidden(url)
      const gate = assertHighRisk('batch_execute', body.input, user?.id)
      if (gate) return gate
      const action = body.input?.action
      const memberIds = body.input?.memberIds || []
      let results: { memberId: string; success: boolean; message: string }[]
      if (action === 'assign_interviewer') {
        const interviewerId = body.input?.interviewerId
        results = memberIds.map((id: string) => {
          const app = rdb.recruitmentApplications.find((a) => a.applicantId === id && a.clubId === query.clubId)
          if (app?.status === 'identity_anomaly') return { memberId: id, success: false, message: '申请人存在身份异常，请先处理' }
          const it = rdb.recruitmentInterviews.find((i) => i.activityId === app?.activityId && i.applicantId === id && ['scheduled', 'in_progress', 'leave', 'late'].includes(i.status))
          if (!it) return { memberId: id, success: false, message: '申请人尚未排期面试，无法分配面试官' }
          if (!interviewerId) return { memberId: id, success: false, message: '未指定面试官' }
          it.interviewerIds = [interviewerId]
          it.version += 1
          return { memberId: id, success: true, message: '已分配面试官' }
        })
      } else {
        results = memberIds.map((id: string) => {
          const app = rdb.recruitmentApplications.find((a) => a.applicantId === id && a.clubId === query.clubId)
          const blocked = app?.status === 'identity_anomaly'
          return { memberId: id, success: !blocked, message: blocked ? '申请人存在身份异常，请先处理' : '成功' }
        })
      }
      writeAuditLog({
        actorName: user.name,
        action: '批量执行',
        targetType: '批量操作',
        targetId: query.clubId,
        detail: `社团 ${query.clubId} 批量${action === 'assign_interviewer' ? '分配面试官' : action} ${memberIds.length} 人：${results.filter((r) => r.success).length} 成功 / ${results.filter((r) => !r.success).length} 失败（${body.input?.reason?.trim()}）`,
        scope: 'org',
      })
      return {
        code: 0,
        data: {
          results,
          completedAt: new Date().toISOString(),
          auditRef: 'BATCH-' + Date.now(),
        },
      }
    },
  },
  // 表单设计器保存草稿（SM-FORM-001：已发布版本不可覆盖；expectedVersion 冲突 → 409）
  {
    url: '/api/org/:clubId/forms/designer/:formId/save',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      const input = body.input as { fields?: unknown[]; version?: number; expectedVersion?: number }
      const result = formdb.saveFormDraft(query.formId, {
        fields: (input.fields || []) as never,
        version: Number(input.version) || 1,
        expectedVersion: input.expectedVersion === undefined ? undefined : Number(input.expectedVersion),
      })
      if (!result.ok) {
        if (result.error.includes('冲突')) {
          return { statusCode: 409, body: { code: 'IFC-ERR-008', message: result.error, supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` } }
        }
        return businessError(result.error)
      }
      return { code: 0, data: result.data }
    },
  },
  // 文件下载
  {
    url: '/api/files/:fileId/download',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      const fileId = query.fileId || query.id || ''
      if (!/^file-\d+-[a-z0-9]+$/.test(fileId)) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '文件不存在或已过期', supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` } }
      }
      return {
        code: 0,
        data: {
          fileId, status: 'downloaded',
          downloadUrl: '/api/mock-files/' + fileId + '.csv',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      }
    },
  },
  // 文件上传（FORM/REC：附件走此端点，3 秒后完成安全检查并返回 fileId）
  {
    url: '/api/files/upload',
    method: 'post',
    response: ({ body }: { body: { input?: { purpose?: string; name?: string } } }) => {
      const fileId = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      const name = body.input?.name || 'upload.bin'
      return {
        code: 0,
        data: {
          fileId,
          name,
          size: 1024 * (8 + Math.floor(Math.random() * 32)),
          mimeType: 'application/octet-stream',
          // 上传完成后即视为已通过 mock 安全检查，与 FilePreviewPage 下载条件（approved）一致
          status: 'approved',
          uploadedAt: new Date().toISOString(),
        },
      }
    },
  },
  // 事实纠错列表
  {
    url: '/api/org/:clubId/audit/corrections',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:audit:view')) return forbidden()
      return {
        code: 0,
        data: {
          // P2-1：读取时派生 overdue（submitted 超审批期限 → overdue），保证逾期纠错可见可处置
          items: [...correctionsDb]
            .map((c) => ({ ...c, status: deriveCorrectionStatus(c) }))
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
          nextCursor: null,
        },
      }
    },
  },
  // 发起事实纠错
  {
    url: '/api/org/:clubId/audit/corrections',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      const user = resolveMockUser(url)
      const submittedAt = new Date().toISOString()
      const record: CorrectionRecord = {
        id: 'cor-' + Date.now(),
        targetType: String(body.input?.targetType || ''),
        targetId: String(body.input?.targetId || ''),
        reason: String(body.input?.reason || ''),
        evidence: String(body.input?.evidence || ''),
        status: 'submitted',
        submittedAt,
        submitterName: user.name,
        auditTrail: [{ action: 'submit', actorName: user.name, at: submittedAt }],
      }
      correctionsDb.unshift(record)
      writeCorrectionAuditLog(record.auditTrail[0], record, 'org')
      return { code: 0, data: record }
    },
  },
  // 处理事实纠错（批准/拒绝）
  {
    url: '/api/org/:clubId/audit/corrections/:correctionId/decide',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { decision: string } } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:audit:view')) return forbidden()
      const record = correctionsDb.find((c) => c.id === query.correctionId)
      if (!record) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '纠错申请不存在', supportId: 'MOCK' } }
      }
      // US-AUD-01 自批校验：不能批准/拒绝自己提交的纠错
      if (record.submitterName === user.name) {
        return businessError('不能处理自己提交的纠错申请')
      }
      // SM-AUD-001：submitted/overdue 均可处置（overdue 可能由派生产生，未落库为 overdue）
      if (!isCorrectionActable({ ...record, status: deriveCorrectionStatus(record) })) return correctionStateConflict()
      const approved = body.input?.decision === 'approve'
      const decidedAt = new Date().toISOString()
      record.status = approved ? 'approved' : 'rejected'
      record.decidedBy = user.name
      record.decidedAt = decidedAt
      const entry: CorrectionAuditEntry = { action: approved ? 'approve' : 'reject', actorName: user.name, at: decidedAt }
      appendCorrectionAudit(record, entry)
      writeCorrectionAuditLog(entry, record, 'org')
      // US-AUD-01 通知联动：处置结果通知提交人
      const submitterUid = correctionSubmitterUserId(record)
      if (submitterUid) {
        pushNotification(
          [submitterUid], 'correction',
          { body: `您提交的事实纠错（${record.targetType} #${record.targetId}）已被${user.name}${approved ? '批准' : '拒绝'}。` },
          { clubId: query.clubId, link: '/me/corrections' },
        )
      }
      return { code: 0, data: { id: record.id, status: record.status, decidedAt, decidedBy: user.name } }
    },
  },
  // 撤回事实纠错
  {
    url: '/api/org/:clubId/audit/corrections/:correctionId/withdraw',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      const record = correctionsDb.find((c) => c.id === query.correctionId)
      if (!record) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '纠错申请不存在', supportId: 'MOCK' } }
      }
      if (record.submitterName !== user.name) return forbidden()
      // SM-AUD-001：submitted/overdue 均可撤回
      if (!isCorrectionActable({ ...record, status: deriveCorrectionStatus(record) })) return correctionStateConflict()
      const withdrawnAt = new Date().toISOString()
      record.status = 'withdrawn'
      record.withdrawnBy = user.name
      record.withdrawnAt = withdrawnAt
      const entry: CorrectionAuditEntry = { action: 'withdraw', actorName: user.name, at: withdrawnAt }
      appendCorrectionAudit(record, entry)
      writeCorrectionAuditLog(entry, record, 'org')
      return { code: 0, data: { id: record.id, status: 'withdrawn', withdrawnAt, withdrawnBy: user.name } }
    },
  },
  // 个人中心：我的纠错列表（本人提交的纠错，数据与社团版共用）
  {
    url: '/api/me/corrections',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      const items = correctionsDb
        .filter((c) => c.submitterName === user.name)
        .map((c) => ({ ...c, status: deriveCorrectionStatus(c) }))
      return {
        code: 0,
        data: { items, nextCursor: null },
      }
    },
  },
  // 个人中心：发起事实纠错
  {
    url: '/api/me/corrections',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      const user = resolveMockUser(url)
      const submittedAt = new Date().toISOString()
      const record: CorrectionRecord = {
        id: 'cor-' + Date.now(),
        targetType: String(body.input?.targetType || ''),
        targetId: String(body.input?.targetId || ''),
        reason: String(body.input?.reason || ''),
        evidence: String(body.input?.evidence || ''),
        status: 'submitted',
        submittedAt,
        submitterName: user.name,
        auditTrail: [{ action: 'submit', actorName: user.name, at: submittedAt }],
      }
      correctionsDb.unshift(record)
      writeCorrectionAuditLog(record.auditTrail[0], record, 'org')
      return { code: 0, data: record }
    },
  },
  // 个人中心：处理事实纠错（批准/拒绝）
  {
    url: '/api/me/corrections/:correctionId/decide',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { decision: string } } }) => {
      const user = resolveMockUser(url)
      const wsClubId = getWorkspace(user)?.clubId
      if (!wsClubId || !getPermissions(user, wsClubId).includes('club:audit:view')) return forbidden()
      const record = correctionsDb.find((c) => c.id === query.correctionId)
      if (!record) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '纠错申请不存在', supportId: 'MOCK' } }
      }
      // US-AUD-01 自批校验：不能批准/拒绝自己提交的纠错
      if (record.submitterName === user.name) {
        return businessError('不能处理自己提交的纠错申请')
      }
      // SM-AUD-001：submitted/overdue 均可处置
      if (!isCorrectionActable({ ...record, status: deriveCorrectionStatus(record) })) return correctionStateConflict()
      const approved = body.input?.decision === 'approve'
      const decidedAt = new Date().toISOString()
      record.status = approved ? 'approved' : 'rejected'
      record.decidedBy = user.name
      record.decidedAt = decidedAt
      const entry: CorrectionAuditEntry = { action: approved ? 'approve' : 'reject', actorName: user.name, at: decidedAt }
      appendCorrectionAudit(record, entry)
      writeCorrectionAuditLog(entry, record, 'org')
      // US-AUD-01 通知联动：处置结果通知提交人
      const submitterUid = correctionSubmitterUserId(record)
      if (submitterUid) {
        pushNotification(
          [submitterUid], 'correction',
          { body: `您提交的事实纠错（${record.targetType} #${record.targetId}）已被${user.name}${approved ? '批准' : '拒绝'}。` },
          { clubId: wsClubId, link: '/me/corrections' },
        )
      }
      return { code: 0, data: { id: record.id, status: record.status, decidedAt, decidedBy: user.name } }
    },
  },
  // 个人中心：撤回事实纠错
  {
    url: '/api/me/corrections/:correctionId/withdraw',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      const record = correctionsDb.find((c) => c.id === query.correctionId)
      if (!record) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '纠错申请不存在', supportId: 'MOCK' } }
      }
      if (record.submitterName !== user.name) return forbidden()
      // SM-AUD-001：submitted/overdue 均可撤回
      if (!isCorrectionActable({ ...record, status: deriveCorrectionStatus(record) })) return correctionStateConflict()
      const withdrawnAt = new Date().toISOString()
      record.status = 'withdrawn'
      record.withdrawnBy = user.name
      record.withdrawnAt = withdrawnAt
      const entry: CorrectionAuditEntry = { action: 'withdraw', actorName: user.name, at: withdrawnAt }
      appendCorrectionAudit(record, entry)
      writeCorrectionAuditLog(entry, record, 'org')
      return { code: 0, data: { id: record.id, status: 'withdrawn', withdrawnAt, withdrawnBy: user.name } }
    },
  },
  // 审计日志（读取共享可写审计库 auditLogsDb；纠错/保留策略等动作实时落库可见）
  {
    url: '/api/org/:clubId/audit/logs',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:audit:view')) return forbidden()
      const allLogs = auditLogsDb.filter((l) => l.scope === 'org')
      const search = query.search
      const items = search ? allLogs.filter((l) => l.actorName.includes(search) || l.action.includes(search) || l.detail.includes(search)) : allLogs
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 正式删除预览
  {
    url: '/api/admin/delete/preview',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      // MRM-012：previewVersion 改为动态返回（不再硬编码 4），版本号仅在删除执行成功后递增；
      // GET 预览保持幂等，连续读取不改变版本号
      return {
        code: 0,
        data: {
          scope: query.scope || 'club',
          targets: [
            { id: 'club-004', label: '摄影协会', type: '社团', recordCount: 12, memberCount: 5 },
            { id: 'act-003', label: '2025 春季补录', type: '活动', recordCount: 3, memberCount: 0 },
          ],
          totalRecords: 15, totalMembers: 5, warning: '删除后不可恢复，相关数据将被永久清除',
          previewVersion: deletePreviewVersion,
        },
      }
    },
  },
  // 数据保留策略（US-AUD-04：不可变版本，草稿与已发布并存；附最近一次执行记录）
  {
    url: '/api/admin/retention',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      return {
        code: 0,
        data: {
          policies: retentionPolicies,
          draftVersion: retentionPolicies.some((p) => p.status === 'draft') ? Math.max(...retentionPolicies.filter((p) => p.status === 'draft').map((p) => p.version)) : null,
          lastExecution: lastRetentionExecution,
        },
      }
    },
  },
  // 新建保留策略草稿（未发布前不生效）
  {
    url: '/api/admin/retention',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { scope?: string; retentionDays?: number; action?: string } } }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      const input = body.input || {}
      const scope = (input.scope || '').trim()
      if (!scope) return businessError('必须填写策略范围')
      if (!input.retentionDays || input.retentionDays < 1) return businessError('保留天数必须为正整数')
      const existing = retentionPolicies.find((p) => p.scope === scope)
      if (existing && existing.status === 'draft') return businessError('该范围已存在待发布的草稿')
      const policy: RetentionPolicy = {
        id: 'rp-draft-' + Date.now(), scope,
        retentionDays: input.retentionDays,
        action: (input.action as RetentionPolicy['action']) || 'auto_delete',
        status: 'draft', version: existing ? existing.version + 1 : 1,
        updatedAt: new Date().toISOString(), publishedAt: null,
      }
      retentionPolicies.unshift(policy)
      return { code: 0, data: policy }
    },
  },
  // 保留策略发布（重认证 + 原因 + 影响预览 + 二次确认；缩短期限需 ≥7 天缓冲）
  {
    url: '/api/admin/retention/:policyId/publish',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { reason?: string; reauthProof?: string; previewVersion?: number } } }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      if (!consumeReauthProof(body.input?.reauthProof, resolveMockUser(url)?.id)) {
        return { statusCode: 401, body: { code: 'IFC-ERR-002', message: '请重新验证身份' } }
      }
      if (body.input?.previewVersion !== retentionPreviewVersion) {
        return { statusCode: 409, body: { code: 'IFC-ERR-008', message: '保留策略影响预览已变化' } }
      }
      if (!body.input?.reason?.trim()) {
        return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '必须填写发布原因' } }
      }
      const policy = retentionPolicies.find((p) => p.id === query.policyId)
      if (!policy) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '策略不存在' } }
      if (policy.status !== 'draft') return businessError('仅草稿状态可发布')
      const active = retentionPolicies.find((p) => p.scope === policy.scope && p.status === 'active')
      const shortening = !!active && policy.retentionDays < active.retentionDays
      policy.status = 'active'
      policy.version += 1
      policy.updatedAt = new Date().toISOString()
      policy.publishedAt = new Date().toISOString()
      retentionPreviewVersion += 1
      const auditRef = 'RP-' + Date.now()
      writeAuditLog({
        actorName: resolveMockUser(url).name,
        action: '发布保留策略',
        targetType: '保留策略',
        targetId: policy.id,
        detail: `「${policy.scope}」保留 ${policy.retentionDays} 天 · ${policy.action === 'auto_delete' ? '自动删除' : policy.action === 'archive' ? '归档' : '保留'}（v${policy.version}）`,
        scope: 'platform',
      })
      return {
        code: 0,
        data: {
          ...policy,
          publishedAt: policy.publishedAt,
          bufferDays: shortening ? 7 : 0,
          notice: shortening ? '保留期限被缩短，已有数据将获得至少 7 天缓冲期后按新策略处理' : null,
          auditRef,
        },
      }
    },
  },
  // 保留策略执行（P1-010：执行器真实处置到期数据，逐策略写审计日志；需重认证 + 原因）
  {
    url: '/api/admin/retention/execute',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { reason?: string; reauthProof?: string } } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:config:manage')) return forbidden()
      if (!consumeReauthProof(body.input?.reauthProof, user?.id)) {
        return { statusCode: 401, body: { code: 'IFC-ERR-002', message: '请重新验证身份' } }
      }
      if (!body.input?.reason?.trim()) {
        return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '必须填写执行原因' } }
      }
      const record = recordRetentionExecution(user.name)
      return {
        code: 0,
        data: {
          runId: record.runId,
          executedAt: record.executedAt,
          results: record.results,
          totalExecuted: record.results.reduce((sum, r) => sum + r.executedCount, 0),
          auditRef: 'AUD-' + Date.now(),
        },
      }
    },
  },
  // 保留策略发布预览（差异 + 受影响对象）
  {
    url: '/api/admin/retention/:policyId/preview',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      const policy = retentionPolicies.find((p) => p.id === query.policyId)
      if (!policy) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '策略不存在' } }
      if (policy.status !== 'draft') return businessError('仅草稿状态可预览')
      const active = retentionPolicies.find((p) => p.scope === policy.scope && p.status === 'active')
      // MRM-011：GET 预览保持幂等——版本号仅在数据实际变化（发布成功）时递增，连续 GET 不改变 previewVersion
      return {
        code: 0,
        data: {
          scope: policy.scope,
          fromDays: active?.retentionDays ?? null,
          toDays: policy.retentionDays,
          action: policy.action,
          affectedObjects: { records: 1260, members: 214 },
          bufferDays: active && policy.retentionDays < active.retentionDays ? 7 : 0,
          previewVersion: retentionPreviewVersion,
        },
      }
    },
  },
  // 正式删除执行
  {
    url: '/api/admin/delete/execute',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { targetIds: string[]; reason?: string; reauthProof?: string; previewVersion?: number } } }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      if (!consumeReauthProof(body.input?.reauthProof, resolveMockUser(url)?.id)) {
        return { statusCode: 401, body: { code: 'IFC-ERR-002', message: '请重新验证身份' } }
      }
      // MRM-012：删除执行校验动态 previewVersion（消除硬编码魔法数 4），与删除预览返回的版本号比对
      if (body.input?.previewVersion !== deletePreviewVersion) {
        return { statusCode: 409, body: { code: 'IFC-ERR-008', message: '删除影响预览已变化' } }
      }
      if (!body.input?.reason?.trim()) {
        return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '必须填写删除原因' } }
      }
      if ((body.input?.targetIds || []).includes('club-004')) {
        return { statusCode: 422, body: { code: 'IFC-ERR-006', message: '目标仍存在活跃关系' } }
      }
      // MRM-012：删除数据实际变化（执行成功）后递增预览版本号，使下一次删除必须重新获取预览
      deletePreviewVersion += 1
      return {
        code: 0,
        data: {
          results: (body.input?.targetIds || []).map((id: string) => ({
            targetId: id, success: true, stores: ['数据库', '附件', '索引'],
          })),
          completedAt: new Date().toISOString(),
          auditRef: 'AUD-' + Date.now(),
        },
      }
    },
  },
// 统计数据（部门负责人按本部门范围过滤；来源=成员职位聚合 + 招新内存库，取代硬编码）
  {
    url: '/api/org/:clubId/stats',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      const clubId = query.clubId
      const scope = departmentScopeFor(user, clubId)
      const activeMembers = db.listMembers(clubId).filter((m) => m.status === 'active')
      // P3-1：口径一致——范围存在时四指标均按本部门过滤（此前仅总成员数/分布过滤，本月新增写死 0）
      const scopedMembers = scope
        ? activeMembers.filter((m) => m.positions.find((p) => p.status === 'active')?.departmentName === scope)
        : activeMembers
      const distMap: Record<string, number> = {}
      for (const m of activeMembers) {
        const dept = m.positions.find((p) => p.status === 'active')?.departmentName
        if (!dept) continue
        distMap[dept] = (distMap[dept] || 0) + 1
      }
      const distribution = Object.entries(distMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
      const now = new Date()
      const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`
      const joinedThisMonth = scopedMembers.filter((m) => monthKey(new Date(m.joinedAt)) === monthKey(now)).length
      const joinedLastMonth = scopedMembers.filter((m) => monthKey(new Date(m.joinedAt)) === monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))).length
      // P2-017 补漏：总成员数趋势口径不再用「当前 − 本月入社」近似——若本月有成员退出，
      // 上期基线会偏低而误报 down。改为纳入本月退出（月初已在册、本月离社）成员；
      // 本月入社又退出的成员两期都不在册，净变化为 0，不重复计入。
      const allScoped = db.listMembers(clubId).filter((m) => !scope || m.positions.some((p) => p.departmentName === scope))
      const exitedThisMonth = allScoped.filter((m) =>
        m.status !== 'active' && m.exitedAt !== null
        && monthKey(new Date(m.exitedAt)) === monthKey(now)
        && monthKey(new Date(m.joinedAt)) !== monthKey(now),
      ).length
      const activeRec = rdb.recruitmentActivities.filter((a) => a.clubId === clubId && a.status === 'in_progress' && (!scope || a.departments.some((d) => d.name === scope))).length
      const pending = rdb.recruitmentApplications.filter((a) => a.clubId === clubId && a.status === 'submitted' && (!scope || a.preferences[0]?.departmentName === scope)).length
      // P2-017：趋势按周期对比真实计算（此前四项 trend 全硬编码 flat/0，趋势信息退化）：
      // 总成员数 = 本月净增（active 无退出时间戳，净增即本月入社数）；本月新增 = 本月 vs 上月入社
      // 活跃招新 = 进行中 vs 近 30 天已结束；待处理申请 = 当前挂起 vs 挂起已逾 30 天（上期遗留量）
      const since30d = Date.now() - 30 * DAY_MS
      const completedRecent = rdb.recruitmentActivities.filter((a) => a.clubId === clubId && a.completedAt !== null && Date.parse(a.completedAt) >= since30d && (!scope || a.departments.some((d) => d.name === scope))).length
      const pendingPrev = rdb.recruitmentApplications.filter((a) => a.clubId === clubId && a.status === 'submitted' && a.submittedAt !== null && Date.parse(a.submittedAt) < since30d && (!scope || a.preferences[0]?.departmentName === scope)).length
      const dept = scope ? distribution.find((d) => d.name === scope) : undefined
      return {
        code: 0,
        data: {
          summary: [
            { label: '总成员数', value: scopedMembers.length, ...trendOf(scopedMembers.length, scopedMembers.length - joinedThisMonth + exitedThisMonth) },
            { label: '本月新增', value: joinedThisMonth, ...trendOf(joinedThisMonth, joinedLastMonth) },
            { label: '活跃招新', value: activeRec, ...trendOf(activeRec, completedRecent) },
            { label: '待处理申请', value: pending, ...trendOf(pending, pendingPrev) },
          ],
          departmentDistribution: scope ? (dept ? [dept] : []) : distribution,
        },
      }
    },
  },
  // 导出任务列表（EXP-001：部门负责人仅见本部门作用域；MRM-009：GC 已超期的 expired/老 failed 任务）
  {
    url: '/api/org/:clubId/exports',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const clubId = query.clubId
      if (!getPermissions(user, clubId).includes('club:export:execute')) return forbidden()
      const scope = exportScopeFor(user, clubId)
      exportTasks.forEach(settleExportTask)
      gcExportTasks(exportTasks)
      return {
        code: 0,
        data: {
          items: exportTasks
            .filter((t) => t.clubId === clubId && (scope === '全社团' || t.scope === scope))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          nextCursor: null,
        },
      }
    },
  },
  // 创建导出任务（EXP：导出是高危操作，需权限；部门负责人仅本部门；
  // MRM-009：同 scope+type 已存在进行中任务时复用并返回（避免数组无限增长），已完成/失败/过期则正常创建新任务）
  {
    url: '/api/org/:clubId/exports',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { type?: string; includeContact?: boolean; includeFiles?: boolean } } }) => {
      const user = resolveMockUser(url)
      const clubId = query.clubId
      if (!getPermissions(user, clubId).includes('club:export:execute')) return forbidden()
      const type = body.input?.type || '成员名单'
      const scope = exportScopeFor(user, clubId)
      // 先结算再判复用：超时的 generating 先落 failed，避免被误判为"进行中"而复用；同时 GC 掉过期任务，
      // 保证反复 POST 后数组有回落途径（MRM-009）
      exportTasks.forEach(settleExportTask)
      gcExportTasks(exportTasks)
      // 重复请求收敛：同 club+scope+type 已存在 generating/processing 任务 → 复用，避免反复 POST 让数组无控增长
      const inflight = exportTasks.find(
        (t) => t.clubId === clubId && t.scope === scope && t.type === type
          && (t.status === 'generating' || t.status === 'processing'),
      )
      if (inflight) return { code: 0, data: inflight }
      const task: ExportTask = {
        id: 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), clubId, type,
        status: 'generating', createdAt: new Date().toISOString(),
        completedAt: null, failedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0,
        scope, includeContact: !!body.input?.includeContact, includeFiles: !!body.input?.includeFiles,
      }
      exportTasks.push(task)
      return { code: 0, data: task }
    },
  },
  // 平台配置
  {
    url: '/api/org/:clubId/config',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          clubName: '计算机协会', clubDescription: '专注计算机技术交流',
          requireEmailVerification: true, requireProfileComplete: true,
          maxMembers: 200, allowSelfExit: true, academicYearStart: 9,
        },
      }
    },
  },
  // 权限模板（US-CFG-01：内存态持久化，不可变版本；与 mockUsers 内置权限集同源）
  {
    url: '/api/admin/config/permission-templates',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:config:manage')) return forbidden()
      return { code: 0, data: { items: permissionTemplates } }
    },
  },
  // 新建权限模板（直接进入草稿状态）
  {
    url: '/api/admin/config/permission-templates',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { name?: string; permissions?: string[] } } }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      const input = body.input || {}
      const name = (input.name || '').trim()
      if (!name) return businessError('模板名称不能为空')
      if (!input.permissions || input.permissions.length === 0) return businessError('权限列表不能为空')
      const template: PermissionTemplate = {
        id: `tpl-${Date.now().toString(36)}`,
        name,
        permissions: [...input.permissions],
        version: 0,
        draftVersion: 1,
        status: 'draft',
      }
      permissionTemplates.push(template)
      return { code: 0, data: template }
    },
  },
  // 保存权限模板草稿（当前缺失的 saveDraft 依赖）
  {
    url: '/api/admin/config/permission-templates/:templateId/save',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { name?: string; permissions?: string[] } } }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      const template = permissionTemplates.find((t) => t.id === query.templateId)
      if (!template) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '模板不存在' } }
      const input = body.input || {}
      const name = (input.name || '').trim()
      if (!name) return businessError('模板名称不能为空')
      if (!input.permissions || input.permissions.length === 0) return businessError('权限列表不能为空')
      template.name = name
      template.permissions = [...input.permissions]
      template.status = 'draft'
      template.draftVersion = (template.version || 1) + 1
      return { code: 0, data: { ...template, savedAt: new Date().toISOString() } }
    },
  },
  // 权限模板差异预览（旧版 vs 草稿 + 受影响对象 + previewVersion）
  {
    url: '/api/admin/config/permission-templates/:templateId/diff',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      const template = permissionTemplates.find((t) => t.id === query.templateId)
      if (!template) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '模板不存在' } }
      if (template.status !== 'draft' || template.draftVersion === null) return businessError('当前没有可预览的草稿')
      const published = templateSeed().find((t) => t.id === template.id)?.permissions ?? []
      const added = template.permissions.filter((p) => !published.includes(p))
      const removed = published.filter((p) => !template.permissions.includes(p))
      // MRM-011：GET diff 保持幂等——版本号仅在发布成功时递增，连续 GET 不改变 previewVersion
      return {
        code: 0,
        data: {
          added,
          removed,
          affectedGroups: ['计算机协会负责人', '电子设计协会负责人'],
          affectedMembers: 214,
          previewVersion: templatePreviewVersion,
        },
      }
    },
  },
// 发布权限模板（重认证 + 差异预览 + 二次确认；失败保留旧版；回滚 = 发布新版本）
  {
    url: '/api/admin/config/permission-templates/:templateId/publish',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { reauthProof?: string; previewVersion?: number; reason?: string } } }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      if (!consumeReauthProof(body.input?.reauthProof, resolveMockUser(url)?.id)) {
        return { statusCode: 401, body: { code: 'IFC-ERR-002', message: '请重新验证身份' } }
      }
      if (body.input?.previewVersion !== templatePreviewVersion) {
        return { statusCode: 409, body: { code: 'IFC-ERR-008', message: '权限差异预览已变化' } }
      }
      if (!body.input?.reason?.trim()) {
        return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '必须填写发布原因' } }
      }
      const template = permissionTemplates.find((t) => t.id === query.templateId)
      if (!template) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '模板不存在' } }
      if (template.status !== 'draft' || template.draftVersion === null) return businessError('仅草稿状态可发布')
      template.version = template.draftVersion
      template.draftVersion = null
      template.status = 'published'
      templatePreviewVersion += 1
      return { code: 0, data: { id: template.id, status: 'published', version: template.version, publishedAt: new Date().toISOString(), auditRef: 'TPL-' + Date.now() } }
    },
  },
  // 保存权限模板草稿
  // 发布权限模板
  // 提交新社团接入向导（ORG-005 从既有 Group 接入；创建进入 wizard_pending，无审批环节，完成接入见 admin/clubs/wizard/save-step + complete）
  {
    url: '/api/admin/clubs/wizard',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { groupId?: string; name?: string; description?: string; leaderGroupId?: string; email?: string; deptGroups?: string[]; roleGroups?: string[]; leaderRoleGroup?: string } } }) => {
      if (!isPlatformClubManager(url)) return forbidden()
      const input = body.input ?? {}
      if (!input.groupId) return businessError('缺少 Group ID')
      const email = (input.email ?? '').trim()
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return businessError('联系邮箱格式不正确')
      const result = orgdb.createClubAccess({
        groupId: input.groupId, name: input.name ?? '', description: input.description, leaderGroupId: input.leaderGroupId ?? '',
        email, deptGroups: input.deptGroups, roleGroups: input.roleGroups, leaderRoleGroup: input.leaderRoleGroup,
      })
      if (!result.ok || !result.data) return businessError(result.error || '接入失败')
      return { code: 0, data: { id: result.data.clubId, status: result.data.status, wizardStep: result.data.wizardStep, createdAt: result.data.createdAt } }
    },
  },
  // ================= P1-011 治理安全端点 =================
  // 高风险命令目录（13 类全量登记，供治理面审计与前端联调）
  {
    url: '/api/admin/governance/high-risk-commands',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden(url, 'get')
      return {
        code: 0,
        data: {
          items: HIGH_RISK_COMMANDS.map((c) => ({
            key: c.key, label: c.label, enforced: c.enforced, endpoints: c.endpoints,
          })),
          total: HIGH_RISK_COMMANDS.length,
          enforcedCount: HIGH_RISK_COMMANDS.filter((c) => c.enforced).length,
        },
      }
    },
  },
  // GOV-006 异常访问告警查询（超管）
  {
    url: '/api/admin/governance/anomaly-access',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:audit:view')) return forbidden(url, 'get')
      const alerts = listAnomalyAlerts()
      return {
        code: 0,
        data: {
          items: alerts,
          openCount: alerts.filter((a) => a.status === 'open').length,
        },
      }
    },
  },
  // GOV-006 异常访问告警确认
  {
    url: '/api/admin/governance/anomaly-access/:alertId/ack',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:audit:view')) return forbidden(url)
      const alert = acknowledgeAnomaly(query.alertId, user.name)
      if (!alert) return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '告警不存在' } }
      return { code: 0, data: alert }
    },
  },
  // GOV-002 真实数据开关：查询（与 OIDC GET 同口径，需 platform:config:manage）
  {
    url: '/api/admin/governance/real-data',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:config:manage')) return forbidden(url, 'get')
      return { code: 0, data: getRealDataSwitch() }
    },
  },
  // GOV-002 真实数据开关：切换（开启为高风险命令 real_data_switch；关闭回演示数据仅写审计）
  {
    url: '/api/admin/governance/real-data',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { useRealData?: boolean; reason?: string; reauthProof?: string } } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:config:manage')) return forbidden(url)
      const target = !!body.input?.useRealData
      if (target) {
        const gate = assertHighRisk('real_data_switch', body.input, user?.id)
        if (gate) return gate
      } else if (!body.input?.reason?.trim()) {
        return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '切回演示数据需填写原因' } }
      }
      const state = setRealDataSwitch(target, user.name)
      writeAuditLog({
        actorName: user.name,
        action: target ? '开启真实数据' : '关闭真实数据',
        targetType: '治理配置',
        targetId: 'real-data-switch',
        detail: `${target ? '演示数据 → 真实数据' : '真实数据 → 演示数据'}：${body.input?.reason?.trim()}`,
        scope: 'platform',
      })
      return { code: 0, data: state }
    },
  },
  // OIDC 安全配置：查询（超管）
  {
    url: '/api/admin/security/oidc',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden(url, 'get')
      return { code: 0, data: getOidcConfig() }
    },
  },
  // OIDC 安全配置：更新（重认证 + 原因 + 审计）
  {
    url: '/api/admin/security/oidc',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> & { reason?: string; reauthProof?: string } } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:config:manage')) return forbidden(url)
      // 先校验原因与字段边界（避免无效请求白白消费一次性 proof），再消费 proof
      if (!body.input?.reason || body.input.reason.trim().length < 5) {
        return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '修改 OIDC 安全配置必须填写原因（至少 5 字）' } }
      }
      const input = body.input
      const reason = input.reason!.trim() // 上方已校验 reason 必填
      const patch: Record<string, unknown> = {}
      if (typeof input.sessionTtlMinutes === 'number') {
        if (input.sessionTtlMinutes < 5 || input.sessionTtlMinutes > 1440) return businessError('会话有效期需在 5-1440 分钟之间')
        patch.sessionTtlMinutes = input.sessionTtlMinutes
      }
      if (typeof input.mfaRequired === 'boolean') patch.mfaRequired = input.mfaRequired
      if (typeof input.enforceStateNonce === 'boolean') patch.enforceStateNonce = input.enforceStateNonce
      if (typeof input.clockSkewSeconds === 'number') {
        if (input.clockSkewSeconds < 0 || input.clockSkewSeconds > 300) return businessError('时钟偏移需在 0-300 秒之间')
        patch.clockSkewSeconds = input.clockSkewSeconds
      }
      if (typeof input.stepUpTtlMinutes === 'number') {
        if (input.stepUpTtlMinutes < 1 || input.stepUpTtlMinutes > 60) return businessError('重认证有效期需在 1-60 分钟之间')
        patch.stepUpTtlMinutes = input.stepUpTtlMinutes
      }
      if (!consumeReauthProof(body.input?.reauthProof, user?.id)) {
        return { statusCode: 401, body: { code: 'IFC-ERR-002', message: '请重新验证身份' } }
      }
      const cfg = updateOidcConfig(patch)
      writeAuditLog({
        actorName: user.name,
        action: '更新 OIDC 安全配置',
        targetType: '安全配置',
        targetId: 'oidc',
        detail: `会话 TTL ${cfg.sessionTtlMinutes} 分钟 / MFA ${cfg.mfaRequired ? '强制' : '可选'} / state+nonce ${cfg.enforceStateNonce ? '强制校验' : '不校验'}（${reason}）`,
        scope: 'platform',
      })
      return { code: 0, data: cfg }
    },
  },
  // 运维状态（统计口径取自真实内存态：社团同步健康 + 导出任务队列）
  {
    url: '/api/admin/ops-status',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const clubs = orgdb.listClubAccesses()
      const abnormalClubs = clubs.filter((c) => c.status === 'sync_abnormal_ro').length
      const recentEvents = clubs
        .flatMap((c) => c.syncEvents.map((e) => ({ id: e.id, kind: e.kind, clubId: c.clubId, clubName: c.clubName, at: e.at, note: e.note })))
        // P3-2：ISO 时间字符串（+08:00 与 Z 混用）用 localeCompare 字典序不可靠，改时间戳差值
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 6)
      // P2-017：统计前先结算任务队列，避免 seed 中逾期未完成的生成中任务（如 exp-002）永久计入 pending
      exportTasks.forEach(settleExportTask)
      adminExportTasks.forEach(settleExportTask)
      const allExportTasks = [...exportTasks, ...adminExportTasks]
      return {
        code: 0,
        data: {
          appVersion: 'v1.0.0-mock',
          uptime: '72h 15m',
          dependencies: [
            { name: 'PostgreSQL', status: 'healthy', latency: 3 },
            { name: 'Casdoor', status: 'healthy', latency: 12 },
            { name: '对象存储', status: 'healthy', latency: 8 },
            { name: '邮件服务', status: 'degraded', latency: 450 },
          ],
          taskQueue: {
            pending: allExportTasks.filter((t) => t.status === 'generating').length,
            // P2-017：processing 取自真实中间态（generating→processing→completed 状态机），不再恒为 0
            processing: allExportTasks.filter((t) => t.status === 'processing').length,
            failed: allExportTasks.filter((t) => t.status === 'failed').length,
          },
          syncHealth: {
            abnormalClubs,
            pendingCorrections: correctionsDb.filter((c) => c.status === 'submitted').length,
            recentEvents,
          },
          lastCheckAt: new Date().toISOString(),
        },
      }
    },
  },
// 管理员路由：配置
  {
    url: '/api/admin/config',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      // P2-3：返回内存库真实保存值（此前为静态种子，POST 仅回显不落库）
      return { code: 0, data: { ...platformConfig } }
    },
  },
  {
    url: '/api/admin/config',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:config:manage')) return forbidden()
      // P2-3：落内存库并回读（重进页面不还原），与 permissionTemplates 持久化方式一致
      // P2-017：白名单逐字段校验后再合并，未知字段/类型不符直接拒绝（防原型污染与类型损坏）
      const input = body.input ?? {}
      for (const key of Object.keys(input)) {
        // hasOwnProperty 判定而非 in：__proto__/constructor 沿原型链在对象上恒为真，in 会被绕过
        if (!Object.prototype.hasOwnProperty.call(CONFIG_FIELD_TYPES, key)) return businessError(`未知配置字段：${key}`)
        const value = input[key]
        const expected = CONFIG_FIELD_TYPES[key as keyof PlatformConfig]
        if (expected === 'number' ? typeof value !== 'number' : typeof value !== expected) {
          return businessError(`配置字段 ${key} 需为 ${expected} 类型`)
        }
      }
      // P2-017 补漏：maxMembers 数值范围校验——必须为 ≥1 的整数（0/负数/小数均拒绝，防容量配置损坏）
      if (typeof input.maxMembers === 'number' && (!Number.isInteger(input.maxMembers) || input.maxMembers < 1)) {
        return businessError('配置字段 maxMembers 需为 1 以上整数')
      }
      Object.assign(platformConfig, input)
      platformConfigVersion += 1
      return { code: 0, data: { ...platformConfig, version: platformConfigVersion, savedAt: new Date().toISOString() } }
    },
  },
  // 管理员路由：统计
  {
    url: '/api/admin/stats',
    method: 'get',
    response: () => {
      const clubs = orgdb.listClubAccesses().filter((c) => c.status === 'enabled')
      const distribution = clubs
        .map((c) => ({ name: c.clubName, count: db.listMembers(c.clubId).filter((m) => m.status === 'active').length }))
        .filter((d) => d.count > 0)
      const totalMembers = distribution.reduce((s, d) => s + d.count, 0)
      const activeRec = rdb.recruitmentActivities.filter((a) => a.status === 'in_progress').length
      return {
        code: 0,
        data: {
          summary: [
            { label: '总社团数', value: clubs.length, trend: 'flat', trendValue: 0 },
            { label: '总成员数', value: totalMembers, trend: 'flat', trendValue: 0 },
            { label: '活跃招新', value: activeRec, trend: 'flat', trendValue: 0 },
            { label: '待处理申请', value: rdb.recruitmentApplications.filter((a) => a.status === 'submitted').length, trend: 'flat', trendValue: 0 },
          ],
          departmentDistribution: distribution,
        },
      }
    },
  },
  // 管理员路由：导出（MRM-009：GET 端点结算后 GC 长期 expired/老 failed；POST 同 type 复用进行中任务）
  {
    url: '/api/admin/exports',
    method: 'get',
    response: ({ url }: { url: string }) => {
      // P2-1：GET 清单与 POST 同鉴权（此前仅 POST 拦截，admin 域端点口径不一致）
      if (!getPermissions(resolveMockUser(url), '').includes('platform:export:execute')) return forbidden()
      adminExportTasks.forEach(settleExportTask)
      gcExportTasks(adminExportTasks)
      return {
        code: 0,
        data: {
          items: adminExportTasks,
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/admin/exports',
    method: 'post',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:export:execute')) return forbidden()
      // 先结算再判复用 + GC（MRM-009：同 type 已有进行中任务则复用，避免反复 POST 让数组无控增长）
      adminExportTasks.forEach(settleExportTask)
      gcExportTasks(adminExportTasks)
      const inflight = adminExportTasks.find(
        (t) => t.type === '全平台导出' && (t.status === 'generating' || t.status === 'processing'),
      )
      if (inflight) return { code: 0, data: inflight }
      const task: ExportTask = {
        id: 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), clubId: '', type: '全平台导出',
        status: 'generating', createdAt: new Date().toISOString(),
        completedAt: null, failedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0,
        scope: '全社团', includeContact: false, includeFiles: false,
      }
      adminExportTasks.push(task)
      return { code: 0, data: task }
    },
  },
  {
    url: '/api/admin/exports/:id/download',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input?: { reason?: string; reauthProof?: string } } }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:export:execute')) return forbidden(url)
      const task = adminExportTasks.find((t) => t.id === query.id)
      if (!task) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '导出任务不存在', supportId: 'MOCK' } }
      }
      // MRM-009：下载前先结算状态机——过期/未完成的任务不得下载（与 org 域口径一致）；
      // expiredAt（24h 链接失效）到 expired 态（+365d）之间有窗口，需单独判定链接失效。
      settleExportTask(task)
      const linkExpired = task.expiredAt !== null && Date.now() >= new Date(task.expiredAt).getTime()
      if (task.status !== 'completed' || !task.downloadUrl || linkExpired) {
        return businessError(linkExpired ? '导出链接已过期，请重新导出' : (task.status === 'expired' ? '导出任务已过期，请重新导出' : '导出任务尚未完成，请稍后重试'))
      }
      const gate = assertHighRisk('export_download', body.input, resolveMockUser(url)?.id)
      if (gate) return gate
      writeAuditLog({
        actorName: resolveMockUser(url).name,
        action: '导出文件下载',
        targetType: '导出任务',
        targetId: query.id,
        detail: `下载平台导出文件 ${query.id}（${body.input?.reason?.trim()}）`,
        scope: 'platform',
      })
      return {
        code: 0,
        data: {
          fileId: query.id, status: 'downloaded',
          downloadUrl: '/api/mock-files/' + query.id + '.csv',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      }
    },
  },
  // 管理员：导出任务状态查询（用于轮询）
  {
    url: '/api/admin/exports/:id/status',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      if (!getPermissions(resolveMockUser(url), '').includes('platform:export:execute')) return forbidden()
      const task = adminExportTasks.find((t) => t.id === query.id)
      if (!task) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '导出任务不存在', supportId: 'MOCK' } }
      }
      settleExportTask(task)
      return {
        code: 0,
        data: {
          id: task.id,
          status: task.status,
          downloadUrl: task.downloadUrl,
          fileSize: task.fileSize,
          completedAt: task.completedAt,
          expiredAt: task.expiredAt,
        },
      }
    },
  },
  // 管理员路由：审计日志
  {
    url: '/api/admin/audit/logs',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:audit:view')) return forbidden()
      const allLogs = auditLogsDb.filter((l) => l.scope === 'platform')
      const search = query.search
      const items = search ? allLogs.filter((l) => l.actorName.includes(search) || l.action.includes(search) || l.detail.includes(search)) : allLogs
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 管理员路由：事实纠错（共享 correctionsDb，与社团版/个人版真实落库一致）
  {
    url: '/api/admin/audit/corrections',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:audit:view')) return forbidden()
      return {
        code: 0,
        data: {
          // P2-1：读取时派生 overdue，保证逾期纠错可见可处置
          items: [...correctionsDb]
            .map((c) => ({ ...c, status: deriveCorrectionStatus(c) }))
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/admin/audit/corrections',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:audit:view')) return forbidden()
      const submittedAt = new Date().toISOString()
      const record: CorrectionRecord = {
        id: 'cor-' + Date.now(),
        targetType: String(body.input?.targetType || ''),
        targetId: String(body.input?.targetId || ''),
        reason: String(body.input?.reason || ''),
        evidence: String(body.input?.evidence || ''),
        status: 'submitted',
        submittedAt,
        submitterName: user.name,
        auditTrail: [{ action: 'submit', actorName: user.name, at: submittedAt }],
      }
      correctionsDb.unshift(record)
      writeCorrectionAuditLog(record.auditTrail[0], record, 'platform')
      return { code: 0, data: record }
    },
  },
  {
    url: '/api/admin/audit/corrections/:correctionId/decide',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { decision: string } } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:audit:view')) return forbidden()
      const record = correctionsDb.find((c) => c.id === query.correctionId)
      if (!record) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '纠错申请不存在', supportId: 'MOCK' } }
      }
      // US-AUD-01 自批校验：不能批准/拒绝自己提交的纠错
      if (record.submitterName === user.name) {
        return businessError('不能处理自己提交的纠错申请')
      }
      // SM-AUD-001：submitted/overdue 均可处置
      if (!isCorrectionActable({ ...record, status: deriveCorrectionStatus(record) })) return correctionStateConflict()
      const approved = body.input?.decision === 'approve'
      const decidedAt = new Date().toISOString()
      record.status = approved ? 'approved' : 'rejected'
      record.decidedBy = user.name
      record.decidedAt = decidedAt
      const entry: CorrectionAuditEntry = { action: approved ? 'approve' : 'reject', actorName: user.name, at: decidedAt }
      appendCorrectionAudit(record, entry)
      writeCorrectionAuditLog(entry, record, 'platform')
      // US-AUD-01 通知联动：处置结果通知提交人
      const submitterUid = correctionSubmitterUserId(record)
      if (submitterUid) {
        pushNotification(
          [submitterUid], 'correction',
          { body: `您提交的事实纠错（${record.targetType} #${record.targetId}）已被${user.name}${approved ? '批准' : '拒绝'}。` },
          { clubId: null, link: '/me/corrections' },
        )
      }
      return { code: 0, data: { id: record.id, status: record.status, decidedAt, decidedBy: user.name } }
    },
  },
  {
    url: '/api/admin/audit/corrections/:correctionId/withdraw',
    method: 'post',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:audit:view')) return forbidden()
      const record = correctionsDb.find((c) => c.id === query.correctionId)
      if (!record) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '纠错申请不存在', supportId: 'MOCK' } }
      }
      if (record.submitterName !== user.name) return forbidden()
      // SM-AUD-001：submitted/overdue 均可撤回
      if (!isCorrectionActable({ ...record, status: deriveCorrectionStatus(record) })) return correctionStateConflict()
      const withdrawnAt = new Date().toISOString()
      record.status = 'withdrawn'
      record.withdrawnBy = user.name
      record.withdrawnAt = withdrawnAt
      const entry: CorrectionAuditEntry = { action: 'withdraw', actorName: user.name, at: withdrawnAt }
      appendCorrectionAudit(record, entry)
      writeCorrectionAuditLog(entry, record, 'platform')
      return { code: 0, data: { id: record.id, status: 'withdrawn', withdrawnAt, withdrawnBy: user.name } }
    },
  },
  // 管理员路由：邮件配置（P1-009：真实存储；未测试通过不可保存）
  {
    url: '/api/admin/notifications/email-config',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const cfg = getEmailConfig(emailConfigKey('platform'))
      return {
        code: 0,
        data: {
          smtpHost: cfg.smtpHost, smtpPort: cfg.smtpPort, smtpUser: cfg.smtpUser,
          fromName: cfg.fromName, encryption: cfg.encryption, verified: cfg.verified,
          lastTestPassedAt: cfg.lastTestPassedAt, keyRotatedAt: cfg.keyRotatedAt,
        },
      }
    },
  },
  {
    url: '/api/admin/notifications/email-config',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const input = (body.input ?? body) as Partial<{ smtpHost: string; smtpPort: number; smtpUser: string; fromName: string; encryption: string }>
      const result = saveEmailConfig(emailConfigKey('platform'), {
        smtpHost: String(input.smtpHost ?? ''),
        smtpPort: Number(input.smtpPort) || 465,
        smtpUser: String(input.smtpUser ?? ''),
        fromName: String(input.fromName ?? ''),
        encryption: (['ssl', 'tls', 'none'].includes(String(input.encryption)) ? String(input.encryption) : 'ssl') as 'ssl' | 'tls' | 'none',
      })
      if (!result.ok) {
        return { statusCode: 422, body: { code: 'IFC-ERR-006', message: '发信配置未通过测试，请先发送测试邮件', supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` } }
      }
      return { code: 0, data: { ...result.config, savedAt: new Date().toISOString() } }
    },
  },
  {
    url: '/api/admin/notifications/email-config/test',
    method: 'post',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const user = resolveMockUser(url)
      const cfg = markEmailTestPassed(emailConfigKey('platform'))
      return { code: 0, data: { status: 'sent', sentAt: cfg.lastTestPassedAt, to: user.email ?? cfg.smtpUser } }
    },
  },
  {
    url: '/api/admin/notifications/email-config/rotate-key',
    method: 'post',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const cfg = rotateEmailKey(emailConfigKey('platform'))
      return { code: 0, data: { rotated: true, rotatedAt: cfg.keyRotatedAt, verified: cfg.verified } }
    },
  },
  // 管理员通知偏好（平台默认偏好：管理端统一配置，保存真实落库）
  {
    url: '/api/admin/notifications/preferences',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      return { code: 0, data: { preferences: listNotificationPreferences('user-admin-001'), savedAt: null } }
    },
  },
  {
    url: '/api/admin/notifications/preferences',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const prefs = (body.input ?? body) as Record<string, unknown>
      for (const [kind, value] of Object.entries(prefs)) {
        if (kind in notificationTemplates && typeof value === 'boolean') {
          setNotificationPreference('user-admin-001', kind, value)
        }
      }
      return { code: 0, data: { preferences: listNotificationPreferences('user-admin-001'), savedAt: new Date().toISOString() } }
    },
  },
  // 紧急关闭（P1-009 kill switch：平台级一键熔断全站通知，US-NTF-01）
  {
    url: '/api/admin/notifications/kill-switch',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      return { code: 0, data: { ...notificationKillSwitch } }
    },
  },
  {
    url: '/api/admin/notifications/kill-switch',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      const user = resolveMockUser(url)
      const input = (body.input ?? body) as { active?: boolean; reason?: string }
      setNotificationKillSwitch({ active: !!input.active, scope: 'platform', reason: input.reason ?? null, operatorName: user.name })
      return { code: 0, data: { ...notificationKillSwitch } }
    },
  },
  // 管理员路由：表单（SM-FORM-001：编辑态取最新草稿，无草稿回退最新已发布版本）
  {
    url: '/api/admin/forms/designer/:formId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const result = formdb.getDesignerState(query.formId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  {
    url: '/api/admin/forms/designer/:formId/save',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      const input = body.input as { fields?: unknown[]; version?: number; expectedVersion?: number }
      const result = formdb.saveFormDraft(query.formId, {
        fields: (input.fields || []) as never,
        version: Number(input.version) || 1,
        expectedVersion: input.expectedVersion === undefined ? undefined : Number(input.expectedVersion),
      })
      if (!result.ok) {
        if (result.error.includes('冲突')) {
          return { statusCode: 409, body: { code: 'IFC-ERR-008', message: result.error, supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` } }
        }
        return businessError(result.error)
      }
      return { code: 0, data: result.data }
    },
  },
  // 平台表单发布/停用/复用/克隆（SM-FORM-001）
  {
    url: '/api/admin/forms/designer/:formId/publish',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: { version?: number } } }) => {
      const result = formdb.publishForm(query.formId, Number(body.input?.version) || 1)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  {
    url: '/api/admin/forms/designer/:formId/deprecate',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      const result = formdb.deprecateForm(query.formId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  {
    url: '/api/admin/forms/designer/:formId/reuse',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      const result = formdb.reuseForm(query.formId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  {
    url: '/api/admin/forms/designer/:formId/clone',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: { title?: string } } }) => {
      const result = formdb.cloneForm(query.formId, body.input?.title)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  {
    url: '/api/admin/forms/:formId',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden(url)
      const result = formdb.getFormDetail(query.formId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  // 平台表单版本草稿保存（SM-FORM-002：仅落库 draft，保存用户填写数据，不推进状态机）
  {
    url: '/api/admin/forms/versions/:formId/draft',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: Record<string, unknown> } }) => {
      if (!isPlatformAdmin(url)) return forbidden(url)
      const input = body.input as { formData?: Record<string, unknown>; version?: number; idempotencyKey?: string }
      const result = formdb.saveFormSubmissionDraft(query.formId, {
        version: Number(input.version) || 1,
        formData: (input.formData || {}) as Record<string, unknown>,
        idempotencyKey: String(input.idempotencyKey || `k-${Date.now()}-${query.formId}-${input.version}`),
        ownerId: resolveMockUser(url).id,
      })
      return formResult(result)
    },
  },
  // 平台表单版本提交（SM-FORM-002：draft→checking→submitted，幂等，快照还原）
  {
    url: '/api/admin/forms/versions/:formId/submit',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: Record<string, unknown> } }) => {
      if (!isPlatformAdmin(url)) return forbidden(url)
      const input = body.input as { formData?: Record<string, unknown>; version?: number; idempotencyKey?: string }
      const result = formdb.submitFormSubmission(query.formId, {
        version: Number(input.version) || 1,
        formData: (input.formData || {}) as Record<string, unknown>,
        idempotencyKey: String(input.idempotencyKey || `k-${Date.now()}-${query.formId}-${input.version}`),
        ownerId: resolveMockUser(url).id,
      })
      return formResult(result)
    },
  },
  // 平台表单版本：读取当前用户的草稿/已提交记录（P2-1 草稿恢复）
  {
    url: '/api/admin/forms/versions/:formId/my-draft',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden(url)
      const result = formdb.getMyFormSubmission(query.formId, resolveMockUser(url).id, Number(query.version) || 1)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
  // 工作空间：导出下载（P1-011 高风险命令 export_download：重认证 + 原因 + 审计；EXP-003 每次下载实时校验当前权限与作用域）
  {
    url: '/api/org/:clubId/exports/:id/download',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input?: { reason?: string; reauthProof?: string } } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:export:execute')) return forbidden(url)
      const task = exportTasks.find((t) => t.id === query.id && t.clubId === query.clubId)
      if (!task) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '导出任务不存在', supportId: 'MOCK' } }
      }
      if (task.scope !== '全社团' && exportScopeFor(user, query.clubId) !== task.scope) return forbidden(url)
      // MRM-009：下载前先结算状态机；并在 expiredAt（24h 链接失效）处禁止下载——
      // 注意 expired 状态在 expiredAt+365d 才由 settle 惰性转换，此窗口内 status 仍为 completed，
      // 因此必须单独用 expiredAt 判定链接是否已失效，否则 24h 失效语义形同虚设。
      settleExportTask(task)
      const linkExpired = task.expiredAt !== null && Date.now() >= new Date(task.expiredAt).getTime()
      if (task.status !== 'completed' || !task.downloadUrl || linkExpired) {
        return businessError(linkExpired ? '导出链接已过期，请重新导出' : (task.status === 'expired' ? '导出任务已过期，请重新导出' : '导出任务尚未完成，请稍后重试'))
      }
      const gate = assertHighRisk('export_download', body.input, user?.id)
      if (gate) return gate
      writeAuditLog({
        actorName: user.name,
        action: '导出文件下载',
        targetType: '导出任务',
        targetId: query.id,
        detail: `下载社团导出文件 ${query.id}（${body.input?.reason?.trim()}）`,
        scope: 'org',
      })
      return {
        code: 0,
        data: {
          fileId: query.id, status: 'downloaded',
          downloadUrl: '/api/mock-files/' + query.id + '.csv',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      }
    },
  },
  // 工作空间：导出任务状态查询（用于轮询）
  {
    url: '/api/org/:clubId/exports/:id/status',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:export:execute')) return forbidden()
      const task = exportTasks.find((t) => t.id === query.id && t.clubId === query.clubId)
      if (!task) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '导出任务不存在', supportId: 'MOCK' } }
      }
      if (task.scope !== '全社团' && exportScopeFor(user, query.clubId) !== task.scope) return forbidden()
      // 状态机在读取时结算：轮询稳定收敛到 completed/failed，失败路径可观测
      settleExportTask(task)
      return {
        code: 0,
        data: {
          id: task.id,
          status: task.status,
          downloadUrl: task.downloadUrl,
          fileSize: task.fileSize,
          completedAt: task.completedAt,
          expiredAt: task.expiredAt,
        },
      }
    },
  },
  // 工作空间：邮件密钥轮换（P1-009：轮换后需重新测试通过）
  {
    url: '/api/org/:clubId/notifications/email-config/rotate-key',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:config:manage')) return forbidden()
      const cfg = rotateEmailKey(emailConfigKey('club', query.clubId))
      return { code: 0, data: { rotated: true, rotatedAt: cfg.keyRotatedAt, verified: cfg.verified } }
    },
  },
  // 工作空间：通知偏好（P1-009：真实落库）
  {
    url: '/api/org/:clubId/notifications/preferences',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      return { code: 0, data: { preferences: listNotificationPreferences(user.id), savedAt: null } }
    },
  },
  {
    url: '/api/org/:clubId/notifications/preferences',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown> } }) => {
      const user = resolveMockUser(url)
      const prefs = (body.input ?? body) as Record<string, unknown>
      for (const [kind, value] of Object.entries(prefs)) {
        if (kind in notificationTemplates && typeof value === 'boolean') {
          setNotificationPreference(user.id, kind, value)
        }
      }
      return { code: 0, data: { preferences: listNotificationPreferences(user.id), savedAt: new Date().toISOString() } }
    },
  },
  // 工作空间：紧急关闭（社团级 kill switch，US-NTF-01）
  {
    url: '/api/org/:clubId/notifications/kill-switch',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:config:manage')) return forbidden()
      return { code: 0, data: { ...clubKillSwitchState(query.clubId) } }
    },
  },
  {
    url: '/api/org/:clubId/notifications/kill-switch',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: Record<string, unknown> } }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:config:manage')) return forbidden()
      const input = (body.input ?? body) as { active?: boolean; reason?: string }
      setNotificationKillSwitch({ active: !!input.active, scope: 'club', clubId: query.clubId, reason: input.reason ?? null, operatorName: user.name })
      return { code: 0, data: { ...clubKillSwitchState(query.clubId) } }
    },
  },
  // 邮件发送记录（P1-009 审计：平台管理员可查）
  {
    url: '/api/admin/notifications/email-outbox',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      return { code: 0, data: { items: emailOutbox.slice(0, 50) } }
    },
  },
  // 通知模板目录（P1-009 审计/配置：模板清单）
  {
    url: '/api/admin/notifications/templates',
    method: 'get',
    response: ({ url }: { url: string }) => {
      if (!isPlatformAdmin(url)) return forbidden()
      return { code: 0, data: { items: Object.values(notificationTemplates) } }
    },
  },
  // 工作空间：表单版本草稿保存（SM-FORM-002：仅落库 draft，保存用户填写数据，不推进状态机）
  {
    url: '/api/org/:clubId/forms/versions/:formId/draft',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: Record<string, unknown> } }) => {
      const input = body.input as { formData?: Record<string, unknown>; version?: number; idempotencyKey?: string }
      const result = formdb.saveFormSubmissionDraft(query.formId, {
        version: Number(input.version) || 1,
        formData: (input.formData || {}) as Record<string, unknown>,
        idempotencyKey: String(input.idempotencyKey || `k-${Date.now()}-${query.formId}-${input.version}`),
        ownerId: resolveMockUser(url).id,
      })
      return formResult(result)
    },
  },
  // 工作空间：表单版本提交（SM-FORM-002：draft→checking→submitted，幂等，快照还原）
  {
    url: '/api/org/:clubId/forms/versions/:formId/submit',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: Record<string, unknown> } }) => {
      const input = body.input as { formData?: Record<string, unknown>; version?: number; idempotencyKey?: string }
      const result = formdb.submitFormSubmission(query.formId, {
        version: Number(input.version) || 1,
        formData: (input.formData || {}) as Record<string, unknown>,
        idempotencyKey: String(input.idempotencyKey || `k-${Date.now()}-${query.formId}-${input.version}`),
        ownerId: resolveMockUser(url).id,
      })
      return formResult(result)
    },
  },
  // 工作空间：表单版本读取当前用户的草稿/已提交记录（P2-1 草稿恢复）
  {
    url: '/api/org/:clubId/forms/versions/:formId/my-draft',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const result = formdb.getMyFormSubmission(query.formId, resolveMockUser(url).id, Number(query.version) || 1)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: result.data }
    },
  },
]

/** 列表页补充 handlers */
const listHandlers: MockMethod[] = [
  // 招新活动列表（社团工作空间）
  {
    url: '/api/org/:clubId/recruitment/list',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const items = rdb.listActivities(query.clubId).map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status === 'in_progress' ? 'published' : a.status,
        channelStatus: a.channelStatus === 'not_open' ? 'closed' : a.channelStatus,
        deadline: a.deadline,
        applicantCount: a.applicantIds.length,
        createdAt: a.createdAt,
      }))
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 联合活动列表（JNT：仅在该社团有角色的用户可访问，与 /org/:clubId 工作台同一权限口径）
  {
    url: '/api/org/:clubId/joint/list',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!user || !user.roles.some((r) => r.clubId === query.clubId)) return forbidden()
      const items = rdb.jointActivities
        .filter((j) => j.clubs.some((c) => c.clubId === query.clubId))
        .map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          channelStatus: j.channelStatus === 'not_open' ? 'closed' : j.channelStatus,
          participants: j.clubs.map((c) => c.clubName),
          applicantCount: j.applicantIds.length,
          createdAt: j.createdAt,
        }))
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 表单列表（SM-FORM-001：展示定义状态与最新版本号）
  {
    url: '/api/org/:clubId/forms',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const result = formdb.listForms(query.clubId)
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: { ...result.data, nextCursor: null } }
    },
  },
  // 平台表单列表
  {
    url: '/api/admin/forms',
    method: 'get',
    response: () => {
      const result = formdb.listPlatformForms()
      if (!result.ok) return businessError(result.error)
      return { code: 0, data: { ...result.data, nextCursor: null } }
    },
  },
  // 平台联合活动列表
  {
    url: '/api/admin/joint',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: rdb.jointActivities.map((j) => ({
            id: j.id,
            title: j.title,
            status: j.status,
            participants: j.clubs.map((c) => c.clubName),
            applicantCount: j.applicantIds.length,
            canForceClose: j.status === 'published',
            clubs: j.clubs.map((c) => ({ clubId: c.clubId, clubName: c.clubName, suspended: c.status === 'force_suspended' })),
          })),
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/admin/recruitment',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: rdb.recruitmentActivities.map((a) => ({
            id: a.id,
            title: a.title,
            clubName: a.clubName,
            status: a.status === 'in_progress' ? 'published' : a.status,
            applicantCount: a.applicantIds.length,
            canForceComplete: a.status === 'in_progress',
          })),
          nextCursor: null,
        },
      }
    },
  },
]

/** mock 文件下载：模拟导出/附件文件的真实下载（配合 downloadUrl 使用，输出 CSV 并提示下载） */
const mockFileHandlers: MockMethod[] = [
  {
    url: '/api/mock-files/:fileId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const fileId = query.fileId || ''
      if (!/^(file-|exp-)[\w.-]+\.csv$/.test(fileId)) {
        return { statusCode: 404, body: { code: 'IFC-ERR-015', message: '文件不存在或已过期', supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` } }
      }
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileId}"`,
        },
        body: '\uFEFF姓名,学号,部门,状态\n陈雨彤,20240002,技术部,成员\n刘子豪,20240001,技术部,候选人\n林婉婷,20240006,设计部,候选人\n',
      }
    },
  },
]

export default [
  ...identityHandlers,
  ...publicHandlers,
  ...organizationHandlers,
  ...notificationHandlers,
  ...personalHandlers,
  ...recruitmentApiHandlers,
  ...memberHandlers,
  ...platformHandlers,
  ...listHandlers,
  ...mockFileHandlers,
].map(mergePathParams).map((h) => ('rawResponse' in h ? h : withStatus(h))) as MockMethod[]
