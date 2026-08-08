/**
 * Mock 层有状态内存库：成员生命周期
 * 单一数据源，页面刷新即重置；状态流转经 state-machines 校验
 */

import { assertTransition } from './state-machines/transitions'
import { syncPositionMembership } from './db-organization'

/** 登录账号 id → 其所属社团成员 id（在 db.members 中按「用户 × 社团」唯一）
 * 原静态映射 auth.USER_MEMBER_MAP 仅按用户维度映射，无法表达多社团用户在不同社团的成员 id，
 * 切换社团后 memberId 会沿用上一社团的值导致自审误判；改为由 members 种子推导单源解析。 */
export const MEMBER_BY_USER: Record<string, Record<string, string>> = {
  'user-leader-001': { 'club-001': 'mem-004', 'club-002': 'mem-101' },
  'user-hr-001': { 'club-001': 'mem-003' },
  'user-interviewer-001': { 'club-001': 'mem-002' },
  'user-member-001': { 'club-001': 'mem-001' },
  'user-deptleader-001': { 'club-001': 'mem-006' },
  // 新身份（P3-1）：资料不完整/邮箱未验证用户同样按「用户 × 社团」登记，避免 currentClubId 已设但成员 id 解析为 null
  'user-incomplete-001': { 'club-001': 'mem-007' },
  'user-unverified-001': { 'club-001': 'mem-008' },
}

/** 按「用户 × 社团」解析成员 id；该用户在目标社团无成员身份（或数据未种子）时返回 null */
export function resolveMemberId(userId: string, clubId: string): string | null {
  return MEMBER_BY_USER[userId]?.[clubId] ?? null
}

/** 成员级异常 id 单调序列：同毫秒批量触发时保证唯一（MemberProfilePage 以 an.id 作 v-for key） */
let anomalySeq = 0

/** 仅供测试重置异常序号（reset.ts 调用，保证跨用例触发号不膨胀） */
export function resetAnomalySeq(): void {
  anomalySeq = 0
}

/** 对账去重窗口（ms）：窗口内同成员同类异常不重复登记（信息未变不产生新记录） */
export const RECONCILE_DEDUP_MS = 30 * 24 * 3600 * 1000

/** 异常上限：单成员最多保留的异常记录（超出丢弃最旧，防止对账反复触发导致成员详情页无限膨胀） */
const ANOMALY_MAX_KEEP = 20

/**
 * 成员级外部变更触发点（P2-015：与社团级 triggerGroupLost 对称）：
 * 模拟对账检测到成员在统一身份认证侧的信息变更，向该成员登记数据异常
 * （成员详情页「数据异常」块呈现，可经事实纠错处理）；不改成员在职状态，仅留痕。
 * 幂等去重：同一成员在去重窗口（RECONCILE_DEDUP_MS）内已存在同类未处置异常时不再重复登记
 * （对账按周期/事件触发，信息未变不产生新记录，避免数据污染）。
 */
export function triggerMemberExternalChange(
  clubId: string,
  memberId: string,
  kind: 'casdoor_mismatch' | 'external_change' = 'external_change',
): { ok: boolean; error?: string; data?: MockMember; registered?: boolean; anomaly?: MockAnomaly } {
  const member = members.find((m) => m.clubId === clubId && m.id === memberId)
  if (!member) return { ok: false, error: '未找到该成员' }
  if (member.status !== 'active') return { ok: false, error: '仅活跃成员可触发外部变更检测' }

  // 幂等去重：同成员同类异常在窗口内已登记且未处置 → 视为重复对账，不再新增
  const now = Date.now()
  const duplicate = member.anomalies.some(
    (a) => a.kind === kind && now - new Date(a.createdAt).getTime() < RECONCILE_DEDUP_MS,
  )
  if (duplicate) return { ok: true, registered: false, data: member }

  const message = kind === 'casdoor_mismatch'
    ? '对账检测到成员在统一身份认证侧信息不一致（如部门/学籍），已登记待人工核验'
    : '对账检测到成员外部信息变更（如学籍/姓名/部门调整），已登记待人工确认'
  const anomaly: MockAnomaly = { id: 'anm-' + now + '-' + anomalySeq++, kind, message, createdAt: new Date().toISOString() }
  member.anomalies.unshift(anomaly)
  // 超上限截断最旧记录（保持成员详情页数据异常块长度可控）
  if (member.anomalies.length > ANOMALY_MAX_KEEP) member.anomalies.length = ANOMALY_MAX_KEEP
  return { ok: true, registered: true, anomaly, data: member }
}

export type MockRoleKey = 'club_leader' | 'hr' | 'department_leader' | 'interviewer' | 'member'

export interface MockDepartment {
  id: string
  name: string
}

export interface MockPosition {
  id: string
  departmentId: string
  departmentName: string
  title: string
  startDate: string
  endDate: string | null
  /** 计划任期结束时间（仅用于换届/到期提醒，不触发自动卸任，MEM-004/MEM-012） */
  plannedEndDate: string | null
  status: 'active' | 'pending_confirmation' | 'transferring' | 'suspended' | 'ended'
}

export interface MockTenure {
  id: string
  departmentName: string
  title: string
  startDate: string
  endDate: string | null
  endReason: string | null
}

export interface MockDeptHistoryEntry {
  id: string
  action: 'join' | 'leave' | 'transfer'
  departmentName: string
  at: string
}

export interface MockAnomaly {
  id: string
  kind: 'casdoor_mismatch' | 'external_change'
  message: string
  createdAt: string
}

export interface MockMember {
  id: string
  clubId: string
  studentId: string
  name: string
  email: string
  phone: string
  status: 'non_member' | 'pending_effective' | 'active' | 'exiting' | 'exited' | 'sync_anomaly'
  positions: MockPosition[]
  tenures: MockTenure[]
  departmentHistory: MockDeptHistoryEntry[]
  anomalies: MockAnomaly[]
  joinedAt: string
  exitedAt: string | null
}

export type DeptApplyType = 'join' | 'leave' | 'transfer'

export interface MockDeptApplication {
  id: string
  clubId: string
  applicantId: string
  applicantName: string
  type: DeptApplyType
  currentDept: string
  targetDeptId: string | null
  targetDeptName: string | null
  reason: string
  status: 'under_review' | 'approved_pending_exec' | 'executing' | 'effective' | 'exec_failed' | 'rejected' | 'withdrawn'
  submittedAt: string
  decidedAt: string | null
  decidedBy: string | null
  rejectReason: string | null
  /** 审批处理期限；逾期只标记不自动处理（MEM-002） */
  dueAt: string
  /** 演示执行失败：'first' 表示第一次执行失败（重试后成功） */
  execFailOn: 'none' | 'first'
  execRetried: boolean
}

export interface MockMembershipInvitation {
  id: string
  clubId: string
  candidateId: string
  candidateName: string
  candidateStudentId: string
  departmentId: string | null
  departmentName: string | null
  status: 'sent' | 'pending_acceptance' | 'accepted_pending_sync' | 'effective' | 'sync_failed' | 'sync_anomaly' | 'withdrawn' | 'rejected' | 'expired' | 'target_already_member'
  sentAt: string
  expiredAt: string
  acceptedAt: string | null
  withdrawnAt: string | null
}

export type AppointmentAction = 'appoint' | 'transfer' | 'dismiss'

export interface MockAppointmentCommand {
  id: string
  clubId: string
  action: AppointmentAction
  memberId: string
  memberName: string
  /** 非成员任命（MEM-003）：此时 memberId 为空，执行时先建成员再任命（一次组合操作） */
  candidateStudentId: string | null
  createMemberOnExecute: boolean
  departmentId: string | null
  departmentName: string | null
  title: string | null
  /** 预约执行时间；null = 立即执行 */
  scheduledAt: string | null
  status: 'pending_exec' | 'initiator_lost_rights' | 'precondition_failed' | 'reconfirmed' | 'cancelled' | 'executing' | 'executed' | 'exec_failed'
  createdAt: string
  createdBy: string
  executedAt: string | null
  failReason: string | null
  /** 演示：执行失败策略 none=恒成功, first=首次失败 */
  execFailOn: 'none' | 'first'
  execRetried: boolean
  /** ORG-001/017：职位 Group 成员同步失败留痕（职位已写入但 Group 未同步的可观测提示） */
  syncWarning?: string
}

export interface MockResignationRequest {
  id: string
  clubId: string
  memberId: string
  memberName: string
  departmentName: string
  title: string
  reason: string
  status: 'under_review' | 'approved' | 'rejected' | 'withdrawn'
  submittedAt: string
  decidedAt: string | null
  decidedBy: string | null
  /** 审批处理期限；逾期只标记不自动处理（MEM-002） */
  dueAt: string
  /** ORG-001/017：辞职批准同步移除职位 Group 失败留痕（与 AppointmentCommand.syncWarning 一致的可观测提示） */
  syncWarning?: string
}

export interface MockExitRequest {
  id: string
  clubId: string
  memberId: string
  memberName: string
  reason: string
  status: 'under_review' | 'approved' | 'exited' | 'rejected' | 'withdrawn'
  submittedAt: string
  decidedAt: string | null
  decidedBy: string | null
  /** 成员本人二次确认时间（批准后的强制确认环节，MEM-001） */
  confirmedAt: string | null
  /** 审批处理期限；逾期只标记不自动处理（MEM-002） */
  dueAt: string
}

export interface MockCandidateUser {
  id: string
  studentId: string
  name: string
  email: string
  phone: string
  isMember: boolean
  /** 既往成员经历（mem-xxx）：历史成员重新加入时关联旧经历，不恢复旧关系（MEM-007） */
  previousMemberId: string | null
}

const now = new Date().toISOString()

function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

/** 默认审批处理期限（天）；超期只标记逾期、状态不变（MEM-002） */
export const DEFAULT_PROCESSING_DAYS = 3

/** 逾期判定：仅在 pending 态下比较 dueAt 与当前时间；非 pending 态不展示逾期 */
export function isProcessingOverdue(status: string, dueAt: string | null | undefined, pending: string[]): boolean {
  if (!dueAt || !pending.includes(status)) return false
  return new Date(dueAt).getTime() < Date.now()
}

export const departments: MockDepartment[] = [
  { id: 'dept-001', name: '技术部' },
  { id: 'dept-002', name: '运营部' },
  { id: 'dept-003', name: '设计部' },
  { id: 'dept-004', name: '人事部' },
]

export const candidates: MockCandidateUser[] = [
  { id: 'cand-001', studentId: '20240010', name: '周明轩', email: 'candidate@example.edu.cn', phone: '13800000010', isMember: false, previousMemberId: null },
  { id: 'cand-002', studentId: '20240011', name: '孙佳琪', email: 'sun@example.edu.cn', phone: '13800000011', isMember: false, previousMemberId: null },
  { id: 'cand-003', studentId: '20240012', name: '郑浩宇', email: 'zheng@example.edu.cn', phone: '13800000012', isMember: false, previousMemberId: null },
  { id: 'cand-004', studentId: '20210005', name: '陈雨桐', email: 'member@example.edu.cn', phone: '13800000005', isMember: true, previousMemberId: null },
  // MEM-007 历史成员重新加入：刘子豪此前已退出（mem-005，2023-09 加入 / 2024-06 退出），再次邀请应追加新经历而非覆盖
  { id: 'cand-005', studentId: '20240001', name: '刘子豪', email: 'former@example.edu.cn', phone: '13800000006', isMember: false, previousMemberId: 'mem-005' },
]

/** 按姓名连续子串/学号精确查找候选 */
export function searchCandidates(_clubId: string, keyword: string): MockCandidateUser[] {
  const kw = keyword.trim()
  if (!kw) return candidates.filter((c) => !c.isMember)
  return candidates.filter((c) => {
    const nameHit = c.name.includes(kw)
    const studentHit = c.studentId === kw
    return (nameHit || studentHit) && !c.isMember
  })
}

export const members: MockMember[] = [
  {
    id: 'mem-001', clubId: 'club-001', studentId: '20210005',
    name: '陈雨桐', email: 'member@example.edu.cn', phone: '13800000005',
    status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-001', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, plannedEndDate: '2027-06-30', status: 'active' },
    ],
    tenures: [
      { id: 'ten-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-001', action: 'join', departmentName: '技术部', at: '2024-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-002', clubId: 'club-001', studentId: '20210004',
    name: '王浩然', email: 'wang@example.edu.cn', phone: '13800000004',
    status: 'active', joinedAt: '2023-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-002', departmentId: 'dept-001', departmentName: '技术部', title: '副部长', startDate: '2024-09-01', endDate: null, plannedEndDate: '2026-08-31', status: 'active' },
    ],
    tenures: [
      { id: 'ten-002', departmentName: '技术部', title: '干事', startDate: '2023-09-01', endDate: '2024-08-31', endReason: '任期结束' },
      { id: 'ten-003', departmentName: '技术部', title: '副部长', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-002', action: 'join', departmentName: '技术部', at: '2023-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-003', clubId: 'club-001', studentId: '20210003',
    name: '李思颖', email: 'hr@example.edu.cn', phone: '13800000003',
    status: 'active', joinedAt: '2023-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-003', departmentId: 'dept-004', departmentName: '人事部', title: '部长', startDate: '2024-09-01', endDate: null, plannedEndDate: '2026-09-30', status: 'active' },
    ],
    tenures: [
      { id: 'ten-004', departmentName: '人事部', title: '部长', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-003', action: 'join', departmentName: '人事部', at: '2023-09-01T10:00:00+08:00' },
    ],
    anomalies: [
      { id: 'anm-001', kind: 'casdoor_mismatch', message: 'Casdoor 侧部门与本地不一致，以 Casdoor 为准', createdAt: '2025-07-28T10:00:00+08:00' },
    ],
  },
  {
    id: 'mem-004', clubId: 'club-001', studentId: '20210002',
    name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002',
    status: 'active', joinedAt: '2022-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-004', departmentId: 'dept-001', departmentName: '技术部', title: '负责人', startDate: '2024-09-01', endDate: null, plannedEndDate: '2026-08-20', status: 'active' },
    ],
    tenures: [
      { id: 'ten-005', departmentName: '管理', title: '负责人', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-004', action: 'join', departmentName: '管理', at: '2022-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-006', clubId: 'club-001', studentId: '20210006',
    name: '林晓薇', email: 'deptleader@example.edu.cn', phone: '13800000007',
    status: 'active', joinedAt: '2022-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-006', departmentId: 'dept-001', departmentName: '技术部', title: '部长', startDate: '2024-09-01', endDate: null, plannedEndDate: null, status: 'active' },
    ],
    tenures: [
      { id: 'ten-007', departmentName: '技术部', title: '干事', startDate: '2022-09-01', endDate: '2023-08-31', endReason: '任期结束' },
      { id: 'ten-008', departmentName: '技术部', title: '副部长', startDate: '2023-09-01', endDate: '2024-08-31', endReason: '任期结束' },
      { id: 'ten-009', departmentName: '技术部', title: '部长', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-007', action: 'join', departmentName: '技术部', at: '2022-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-007', clubId: 'club-001', studentId: '20240201',
    name: '赵雨萌', email: 'incomplete@example.edu.cn', phone: '13800000021',
    status: 'active', joinedAt: '2025-09-01T00:00:00+08:00', exitedAt: null,
    positions: [],
    tenures: [],
    departmentHistory: [],
    anomalies: [],
  },
  {
    id: 'mem-008', clubId: 'club-001', studentId: '20240202',
    name: '孙雅静', email: 'unverified@example.edu.cn', phone: '13800000022',
    status: 'active', joinedAt: '2025-09-01T00:00:00+08:00', exitedAt: null,
    positions: [],
    tenures: [],
    departmentHistory: [],
    anomalies: [],
  },
  {
    id: 'mem-101', clubId: 'club-002', studentId: '20210002',
    name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002',
    status: 'active', joinedAt: '2024-03-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-101', departmentId: 'dept-101', departmentName: '嵌入式组', title: '人事', startDate: '2024-03-01', endDate: null, plannedEndDate: null, status: 'active' },
    ],
    tenures: [
      { id: 'ten-101', departmentName: '嵌入式组', title: '人事', startDate: '2024-03-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-101', action: 'join', departmentName: '嵌入式组', at: '2024-03-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-005', clubId: 'club-001', studentId: '20240001',
    name: '刘子豪', email: 'former@example.edu.cn', phone: '13800000006',
    status: 'exited', joinedAt: '2023-09-01T00:00:00+08:00', exitedAt: '2024-06-01T00:00:00+08:00',
    positions: [
      { id: 'pos-005', departmentId: 'dept-001', departmentName: '技术部', title: '成员', startDate: '2023-09-01', endDate: '2024-06-01', plannedEndDate: null, status: 'ended' },
    ],
    tenures: [
      { id: 'ten-006', departmentName: '技术部', title: '成员', startDate: '2023-09-01', endDate: '2024-06-01', endReason: '主动退出' },
    ],
    departmentHistory: [
      { id: 'dhis-005', action: 'join', departmentName: '技术部', at: '2023-09-01T10:00:00+08:00' },
      { id: 'dhis-006', action: 'leave', departmentName: '技术部', at: '2024-06-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
]

export const departmentApplications: MockDeptApplication[] = [
  {
    id: 'dap-001', clubId: 'club-001', applicantId: 'mem-001', applicantName: '陈雨桐',
    type: 'transfer', currentDept: '技术部', targetDeptId: 'dept-002', targetDeptName: '运营部',
    reason: '希望尝试新的方向', status: 'under_review',
    submittedAt: '2025-07-28T10:00:00+08:00', decidedAt: null, decidedBy: null, rejectReason: null,
    dueAt: daysFromNow(1), execFailOn: 'first', execRetried: false,
  },
  {
    id: 'dap-002', clubId: 'club-001', applicantId: 'mem-002', applicantName: '王浩然',
    type: 'join', currentDept: '-', targetDeptId: 'dept-003', targetDeptName: '设计部',
    reason: '对设计工作感兴趣', status: 'under_review',
    submittedAt: '2025-07-20T10:00:00+08:00', decidedAt: null, decidedBy: null, rejectReason: null,
    // 已超处理期限：列表派生逾期标记（MEM-002 演示）
    dueAt: daysFromNow(-1), execFailOn: 'none', execRetried: false,
  },
]

export const membershipInvitations: MockMembershipInvitation[] = [
  {
    id: 'minv-001', clubId: 'club-001', candidateId: 'cand-001', candidateName: '周明轩', candidateStudentId: '20240010',
    departmentId: 'dept-001', departmentName: '技术部',
    status: 'pending_acceptance', sentAt: '2025-07-30T10:00:00+08:00', expiredAt: daysFromNow(5), acceptedAt: null, withdrawnAt: null,
  },
  {
    id: 'minv-002', clubId: 'club-001', candidateId: 'cand-002', candidateName: '孙佳琪', candidateStudentId: '20240011',
    departmentId: null, departmentName: null,
    status: 'accepted_pending_sync', sentAt: '2025-07-25T10:00:00+08:00', expiredAt: daysFromNow(-2), acceptedAt: '2025-07-26T15:00:00+08:00', withdrawnAt: null,
  },
]

export const appointmentCommands: MockAppointmentCommand[] = [
  {
    id: 'apc-001', clubId: 'club-001', action: 'appoint', memberId: 'mem-001', memberName: '陈雨桐',
    candidateStudentId: null, createMemberOnExecute: false,
    departmentId: 'dept-003', departmentName: '设计部', title: '副部长',
    scheduledAt: null, status: 'pending_exec', createdAt: '2025-07-28T10:00:00+08:00', createdBy: '张明远',
    executedAt: null, failReason: null, execFailOn: 'first', execRetried: false,
  },
  {
    id: 'apc-002', clubId: 'club-001', action: 'dismiss', memberId: 'mem-002', memberName: '王浩然',
    candidateStudentId: null, createMemberOnExecute: false,
    departmentId: null, departmentName: null, title: null,
    scheduledAt: daysFromNow(2), status: 'initiator_lost_rights', createdAt: '2025-07-20T10:00:00+08:00', createdBy: '张明远',
    executedAt: null, failReason: '发起人已失去对应权限', execFailOn: 'none', execRetried: false,
  },
]

/** 组合任命候选人搜索（MEM-003）：全校范围内的非成员 + 现任成员统一检索，供任命面板使用 */
export function searchAppointmentCandidates(clubId: string, keyword: string): { members: MockMember[]; nonMembers: MockCandidateUser[] } {
  const kw = keyword.trim()
  const nonMembers = candidates.filter((c) => !c.isMember && (!kw || c.name.includes(kw) || c.studentId === kw))
  const memberList = listMembers(clubId)
    .filter((m) => m.status === 'active')
    .filter((m) => !kw || m.name.includes(kw) || m.studentId === kw)
  return { members: memberList, nonMembers }
}

export const resignationRequests: MockResignationRequest[] = [
  {
    id: 'res-001', clubId: 'club-001', memberId: 'mem-002', memberName: '王浩然',
    departmentName: '技术部', title: '副部长', reason: '学业压力较大',
    status: 'under_review', submittedAt: '2025-07-29T10:00:00+08:00', decidedAt: null, decidedBy: null,
    dueAt: daysFromNow(2),
  },
  {
    id: 'res-002', clubId: 'club-001', memberId: 'mem-006', memberName: '林晓薇',
    departmentName: '技术部', title: '部长', reason: '个人发展规划调整',
    status: 'under_review', submittedAt: '2025-07-25T10:00:00+08:00', decidedAt: null, decidedBy: null,
    // 已超处理期限：列表派生逾期标记（MEM-002 演示）
    dueAt: daysFromNow(-1),
  },
]

export const exitRequests: MockExitRequest[] = [
  {
    id: 'exit-req-001', clubId: 'club-001', memberId: 'mem-006', memberName: '林晓薇',
    reason: '毕业离校，申请退出社团',
    status: 'under_review', submittedAt: '2025-07-30T10:00:00+08:00',
    decidedAt: null, decidedBy: null, confirmedAt: null, dueAt: daysFromNow(1),
  },
  {
    id: 'exit-req-002', clubId: 'club-001', memberId: 'mem-001', memberName: '陈雨桐',
    reason: '精力有限，主动退出',
    status: 'under_review', submittedAt: '2025-07-22T10:00:00+08:00',
    decidedAt: null, decidedBy: null, confirmedAt: null,
    // 已超处理期限：退出任务逾期提醒（MEM-002 演示）
    dueAt: daysFromNow(-1),
  },
]

export interface TransitionCandidate {
  memberId: string
  name: string
  currentTitle: string
  proposedTitle: string
  department: string
}

export interface TransitionAppointment {
  memberId: string
  name: string
  currentTitle: string
  proposedTitle: string
  department: string
}

export const transitionState = {
  currentLeader: { id: 'mem-004', name: '张明远', title: '负责人' },
  candidates: [
    { memberId: 'mem-002', name: '王浩然', currentTitle: '副部长', proposedTitle: '负责人', department: '技术部' },
    { memberId: 'mem-003', name: '李思颖', currentTitle: '部长', proposedTitle: '副负责人', department: '人事部' },
  ] as TransitionCandidate[],
  appointments: [
    { memberId: 'mem-001', name: '陈雨桐', currentTitle: '干事', proposedTitle: '副部长', department: '技术部' },
  ] as TransitionAppointment[],
  /** 演示：执行时部分失败 */
  failOn: 'none' as 'none' | 'partial',
  executedAt: null as string | null,
  results: [] as { memberId: string; name: string; action: string; targetTitle: string; success: boolean; message: string }[],
  /** ORG-001/017：换届执行时负责人 Group 成员同步失败留痕（position 已写入但 Group 未同步时可观测） */
  syncFailures: [] as { memberId: string; memberName: string; title: string; active: boolean; error: string }[],
}

// ================= 业务规则校验与操作 =================

export function findMember(clubId: string, memberId: string): MockMember | undefined {
  return members.find((m) => m.clubId === clubId && m.id === memberId)
}

/** 末位负责人：社团内唯一 status=active 且为负责人/副负责人级别的管理位 */
export function isLastLeader(clubId: string, memberId: string): boolean {
  const leaders = members.filter((m) => m.clubId === clubId && m.status === 'active' && m.positions.some((p) => p.status === 'active' && p.title === '负责人'))
  return leaders.length === 1 && leaders[0].id === memberId
}

export function countActiveLeaders(clubId: string): number {
  return members.filter((m) => m.clubId === clubId && m.status === 'active' && m.positions.some((p) => p.status === 'active' && p.title === '负责人')).length
}

/** 是否存在同社团同一候选的待处理邀请（sent/pending_acceptance） */
export function hasPendingInvitation(clubId: string, candidateId: string): boolean {
  return membershipInvitations.some((i) => i.clubId === clubId && i.candidateId === candidateId && (i.status === 'sent' || i.status === 'pending_acceptance'))
}

export function listInvitations(clubId: string): MockMembershipInvitation[] {
  return membershipInvitations.filter((i) => i.clubId === clubId)
}

export function createDepartmentApplication(clubId: string, input: { applicantId: string; applicantName: string; type: DeptApplyType; currentDept: string; targetDeptId: string; reason: string }): MockDeptApplication {
  const target = departments.find((d) => d.id === input.targetDeptId)
  const app: MockDeptApplication = {
    id: 'dap-' + Date.now(), clubId,
    applicantId: input.applicantId, applicantName: input.applicantName,
    type: input.type, currentDept: input.currentDept,
    targetDeptId: input.targetDeptId, targetDeptName: target?.name || null,
    reason: input.reason, status: 'under_review',
    submittedAt: now, decidedAt: null, decidedBy: null, rejectReason: null,
    dueAt: daysFromNow(DEFAULT_PROCESSING_DAYS),
    execFailOn: input.type === 'transfer' ? 'first' : 'none', execRetried: false,
  }
  departmentApplications.unshift(app)
  return app
}

export function decideDepartmentApplication(appId: string, decision: 'approve' | 'reject', actorId: string, actorName: string, rejectReason?: string): { ok: boolean; error?: string; app?: MockDeptApplication } {
  const app = departmentApplications.find((a) => a.id === appId)
  if (!app) return { ok: false, error: '申请不存在' }
  if (app.status !== 'under_review') return { ok: false, error: '该申请已处理或已撤回，无法重复操作' }
  if (app.applicantId === actorId) return { ok: false, error: '不能审批自己的申请' }
  if (decision === 'reject') {
    if (!rejectReason?.trim()) return { ok: false, error: '驳回必须填写原因' }
    const t = assertTransition('SM-MEM-003', app.status, 'rejected', 'reject')
    if (!t.ok) return { ok: false, error: t.reason || '当前状态不可驳回' }
    app.status = 'rejected'
    app.rejectReason = rejectReason
    app.decidedAt = now
    app.decidedBy = actorName
    return { ok: true, app }
  }
  const t = assertTransition('SM-MEM-003', app.status, 'approved_pending_exec', 'approve')
  if (!t.ok) return { ok: false, error: t.reason || '当前状态不可通过' }
  app.status = 'approved_pending_exec'
  app.decidedAt = now
  app.decidedBy = actorName
  return { ok: true, app }
}

export function executeDepartmentApplication(appId: string): { ok: boolean; error?: string; app?: MockDeptApplication } {
  const app = departmentApplications.find((a) => a.id === appId)
  if (!app) return { ok: false, error: '申请不存在' }
  const entry = app.status === 'approved_pending_exec' ? 'execute' : 'retry'
  const t1 = assertTransition('SM-MEM-003', app.status, 'executing', entry)
  if (!t1.ok) return { ok: false, error: t1.reason || '当前状态不可执行' }
  app.status = 'executing'
  if (app.execFailOn === 'first' && !app.execRetried) {
    app.execRetried = true
    const t2 = assertTransition('SM-MEM-003', app.status, 'exec_failed', 'failed')
    if (t2.ok) app.status = 'exec_failed'
    return { ok: false, error: '执行失败：目标部门关系写入未确认，保持原关系', app }
  }
  const t2 = assertTransition('SM-MEM-003', app.status, 'effective', 'confirmed')
  if (!t2.ok) return { ok: false, error: t2.reason || '执行写入未确认' }
  app.status = 'effective'
  const member = findMember(app.clubId, app.applicantId)
  if (member) {
    if (app.type === 'join' || app.type === 'transfer') {
      member.positions.push({
        id: 'pos-' + Date.now(), departmentId: app.targetDeptId || '', departmentName: app.targetDeptName || '',
        title: '成员', startDate: new Date().toISOString().slice(0, 10), endDate: null, plannedEndDate: null, status: 'active',
      })
    }
    if (app.type === 'leave' || app.type === 'transfer') {
      const pos = member.positions.find((p) => p.status === 'active' && p.departmentName === app.currentDept)
      if (pos) {
        const t3 = assertTransition('SM-MEM-002', pos.status, 'ended', 'end_change')
        if (!t3.ok) return { ok: false, error: t3.reason || '当前职位状态无法结束' }
        pos.endDate = new Date().toISOString().slice(0, 10)
        pos.status = 'ended'
      }
    }
    // 统一历史记录语义：transfer 写单条 'transfer'，join/leave 各写一条
    const action = app.type === 'transfer' ? 'transfer' : app.type
    const deptName = app.type === 'leave' ? app.currentDept : (app.targetDeptName || '')
    member.departmentHistory.unshift({ id: 'dhis-' + Date.now(), action, departmentName: deptName, at: now })
  }
  return { ok: true, app }
}

export function createMembershipInvitation(clubId: string, input: { candidateId: string; departmentId: string | null; expireDays: number; actorId: string; actorName: string }): { ok: boolean; error?: string; invitation?: MockMembershipInvitation } {
  const candidate = candidates.find((c) => c.id === input.candidateId)
  if (!candidate) return { ok: false, error: '未找到该用户' }
  if (candidate.isMember) return { ok: false, error: '目标已是本社团成员' }
  if (hasPendingInvitation(clubId, candidate.id)) return { ok: false, error: '该用户已有一份待处理邀请' }
  const dept = departments.find((d) => d.id === input.departmentId) || null
  const invitation: MockMembershipInvitation = {
    id: 'minv-' + Date.now(), clubId, candidateId: candidate.id, candidateName: candidate.name, candidateStudentId: candidate.studentId,
    departmentId: dept?.id || null, departmentName: dept?.name || null,
    status: 'sent', sentAt: now, expiredAt: daysFromNow(input.expireDays || 7), acceptedAt: null, withdrawnAt: null,
  }
  membershipInvitations.unshift(invitation)
  return { ok: true, invitation }
}

export function withdrawInvitation(invitationId: string): { ok: boolean; error?: string; invitation?: MockMembershipInvitation } {
  const inv = membershipInvitations.find((i) => i.id === invitationId)
  if (!inv) return { ok: false, error: '邀请不存在' }
  if (inv.status !== 'sent' && inv.status !== 'pending_acceptance') return { ok: false, error: '仅待处理的邀请可撤回' }
  // SM-MEM-004 状态机仅定义 pending_acceptance --withdraw--> withdrawn（sent 为发出态，撤回属状态机外补充）
  if (inv.status === 'pending_acceptance') {
    const t = assertTransition('SM-MEM-004', inv.status, 'withdrawn', 'withdraw')
    if (!t.ok) return { ok: false, error: t.reason || '当前状态不可撤回' }
  }
  inv.status = 'withdrawn'
  inv.withdrawnAt = now
  return { ok: true, invitation: inv }
}

export function respondInvitation(invitationId: string, action: 'accept' | 'reject'): { ok: boolean; error?: string; invitation?: MockMembershipInvitation } {
  const inv = membershipInvitations.find((i) => i.id === invitationId)
  if (!inv) return { ok: false, error: '邀请不存在' }
  if (inv.status !== 'sent' && inv.status !== 'pending_acceptance') return { ok: false, error: '该邀请已处理，无法再次操作' }
  if (new Date(inv.expiredAt).getTime() < Date.now()) {
    const t = assertTransition('SM-MEM-004', inv.status, 'expired', 'expire')
    if (t.ok) {
      inv.status = 'expired'
      return { ok: false, error: '邀请已过期' }
    }
    return { ok: false, error: '邀请已过期' }
  }
  if (action === 'reject') {
    const t = assertTransition('SM-MEM-004', inv.status, 'rejected', 'reject')
    if (!t.ok) return { ok: false, error: t.reason || '当前状态不可拒绝' }
    inv.status = 'rejected'
    return { ok: true, invitation: inv }
  }
  // 整体接受：加入社团 + 初始部门必须整体生效，部分失败则整体回滚
  const t = assertTransition('SM-MEM-004', inv.status, 'accepted_pending_sync', 'accept')
  if (!t.ok) return { ok: false, error: t.reason || '当前状态不可接受' }
  inv.status = 'accepted_pending_sync'
  inv.acceptedAt = now
  return { ok: true, invitation: inv }
}

/** 模拟 Casdoor 回读确认（邀请生效链路的一部分） */
export function confirmInvitationSync(invitationId: string): { ok: boolean; error?: string; invitation?: MockMembershipInvitation } {
  const inv = membershipInvitations.find((i) => i.id === invitationId)
  if (!inv) return { ok: false, error: '邀请不存在' }
  if (inv.status === 'accepted_pending_sync') {
    const t = assertTransition('SM-MEM-004', inv.status, 'effective', 'confirmed')
    if (!t.ok) return { ok: false, error: t.reason || '当前状态不可确认生效' }
    // 复用 createMemberFromAdmission：业务生效时间取邀请接受时间（而非回读确认时间），且幂等不重复创建
    const admitted = createMemberFromAdmission(inv.clubId, {
      studentId: inv.candidateStudentId,
      name: inv.candidateName,
      departmentId: inv.departmentId,
      departmentName: inv.departmentName,
      acceptedAt: inv.acceptedAt || now,
    })
    if (!admitted.ok) return { ok: false, error: admitted.error || '成员创建失败' }
    inv.status = 'effective'
    return { ok: true, invitation: inv }
  }
  return { ok: false, error: '仅接受待同步的邀请可确认生效' }
}

/**
 * 录取/联合邀请接受后的成员创建桥（06「接受普通或联合录取后，成员业务生效时间为接受时间」）。
 * 幂等：同社团同学号的现有（active/非离职终态）成员不重复创建；业务生效时间取邀请接受时间，而非回读确认时间。
 * 幂等边界：exiting（离职中）/pending_effective（待生效）显式报错要求先完成原流程；联系方式优先调用方透传（录取链路从申请人档案解析），其次候选人档案。
 */
export function createMemberFromAdmission(clubId: string, input: { studentId: string; name: string; departmentId: string | null; departmentName: string | null; acceptedAt: string; email?: string; phone?: string }): { ok: boolean; created: boolean; member?: MockMember; error?: string } {
  if (!input.studentId) return { ok: false, created: false, error: '学号为空，无法创建成员' }
  const existing = members.find((m) => m.clubId === clubId && m.studentId === input.studentId && m.status !== 'exited')
  // exiting（离职中）/pending_effective（待生效）并非可用的在职成员：直接复用会静默产生「已确认但无 active 成员」的边界态，显式报错要求先完成原流程
  if (existing && (existing.status === 'exiting' || existing.status === 'pending_effective')) {
    return { ok: false, created: false, error: `该学号在本社团存在${existing.status === 'exiting' ? '离职中' : '待生效'}的成员记录，请先完成原有流程` }
  }
  if (existing) return { ok: true, created: false, member: existing }
  const candidate = candidates.find((c) => c.studentId === input.studentId)
  // 联系方式：优先调用方透传（录取链路由申请人档案解析，避免空串），其次候选人档案
  const email = input.email !== undefined ? input.email : (candidate?.email ?? '')
  const phone = input.phone !== undefined ? input.phone : (candidate?.phone ?? '')
  const member: MockMember = {
    id: 'mem-' + Date.now(), clubId, studentId: input.studentId, name: input.name,
    email, phone, status: 'active',
    joinedAt: input.acceptedAt, exitedAt: null,
    positions: input.departmentId ? [{ id: 'pos-' + Date.now(), departmentId: input.departmentId, departmentName: input.departmentName || '', title: '成员', startDate: input.acceptedAt.slice(0, 10), endDate: null, plannedEndDate: null, status: 'active' }] : [],
    tenures: [], departmentHistory: input.departmentId ? [{ id: 'dhis-' + Date.now(), action: 'join', departmentName: input.departmentName || '', at: input.acceptedAt }] : [], anomalies: [],
  }
  members.push(member)
  return { ok: true, created: true, member }
}

export function createAppointmentCommand(clubId: string, input: { action: AppointmentAction; memberId: string; memberName: string; departmentId: string | null; departmentName: string | null; title: string | null; scheduledAt: string | null; actorName: string; candidateStudentId?: string | null }): { ok: boolean; error?: string; command?: MockAppointmentCommand } {
  const createMemberOnExecute = !!input.candidateStudentId
  if (createMemberOnExecute) {
    // 非成员组合任命（MEM-003）：加入社团 + 部门 + 职位为一次组合操作，仅支持任命动作
    if (input.action !== 'appoint') return { ok: false, error: '非成员仅可发起任命，不支持调岗/免职' }
    if (!input.departmentId || !input.title) return { ok: false, error: '非成员任命必须指定部门与职位' }
  }
  if (input.action === 'dismiss' && input.memberId) {
    const member = findMember(clubId, input.memberId)
    const isLeader = !!member?.positions.find((p) => p.status === 'active' && p.title === '负责人')
    if (isLeader && isLastLeader(clubId, input.memberId)) return { ok: false, error: '最后一名负责人不能无交接离任，请先安排交接' }
  }
  const command: MockAppointmentCommand = {
    id: 'apc-' + Date.now(), clubId, action: input.action,
    memberId: input.memberId, memberName: input.memberName,
    candidateStudentId: input.candidateStudentId || null, createMemberOnExecute,
    departmentId: input.departmentId, departmentName: input.departmentName, title: input.title,
    scheduledAt: input.scheduledAt, status: 'pending_exec',
    createdAt: now, createdBy: input.actorName, executedAt: null, failReason: null,
    execFailOn: 'first', execRetried: false,
  }
  appointmentCommands.unshift(command)
  return { ok: true, command }
}

export function cancelAppointmentCommand(commandId: string): { ok: boolean; error?: string } {
  const cmd = appointmentCommands.find((c) => c.id === commandId)
  if (!cmd) return { ok: false, error: '命令不存在' }
  const t = assertTransition('SM-ORG-003', cmd.status, 'cancelled', 'cancel')
  if (!t.ok) return { ok: false, error: t.reason || '当前状态不可取消' }
  cmd.status = 'cancelled'
  return { ok: true }
}

export function reconfirmAppointmentCommand(commandId: string, scheduledAt: string): { ok: boolean; error?: string } {
  const cmd = appointmentCommands.find((c) => c.id === commandId)
  if (!cmd) return { ok: false, error: '命令不存在' }
  // pending_exec 属待执行态，仅更新计划时间不触发状态转换
  if (cmd.status === 'pending_exec') {
    cmd.scheduledAt = scheduledAt
    return { ok: true }
  }
  const event = cmd.status === 'initiator_lost_rights' ? 'reconfirm' : 'reconfirm_new_time'
  const t = assertTransition('SM-ORG-003', cmd.status, 'reconfirmed', event)
  if (!t.ok) return { ok: false, error: t.reason || '当前状态不可重新确认' }
  cmd.scheduledAt = scheduledAt
  cmd.status = 'reconfirmed'
  return { ok: true }
}

export function executeAppointmentCommand(commandId: string): { ok: boolean; error?: string; command?: MockAppointmentCommand } {
  const cmd = appointmentCommands.find((c) => c.id === commandId)
  if (!cmd) return { ok: false, error: '命令不存在' }
  const entryEvent = cmd.status === 'exec_failed' ? 'retry' : 'execute_ok'
  const t1 = assertTransition('SM-ORG-003', cmd.status, 'executing', entryEvent)
  if (!t1.ok) return { ok: false, error: t1.reason || '当前状态不可执行' }
  cmd.status = 'executing'
  if (cmd.execFailOn === 'first' && !cmd.execRetried) {
    cmd.execRetried = true
    const t2 = assertTransition('SM-ORG-003', cmd.status, 'exec_failed', 'external_failed')
    if (t2.ok) cmd.status = 'exec_failed'
    cmd.failReason = '执行失败：Casdoor 回读未确认，保持原关系'
    return { ok: false, error: cmd.failReason, command: cmd }
  }
  const t2 = assertTransition('SM-ORG-003', cmd.status, 'executed', 'group_confirmed')
  if (!t2.ok) return { ok: false, error: t2.reason || '执行结果未确认' }
  cmd.status = 'executed'
  cmd.executedAt = now
  let member = findMember(cmd.clubId, cmd.memberId)
  // 非成员组合任命（MEM-003）：执行时先创建成员（不带部门），再按命令写入部门职位——同一次操作原子完成
  if (!member && cmd.createMemberOnExecute && cmd.candidateStudentId) {
    const created = createMemberFromAdmission(cmd.clubId, {
      studentId: cmd.candidateStudentId,
      name: cmd.memberName,
      departmentId: null, departmentName: null,
      acceptedAt: now,
    })
    if (created.ok && created.member) member = created.member
  }
  if (member) {
    if (cmd.action === 'dismiss') {
      const pos = member.positions.find((p) => p.status === 'active')
      if (pos) {
        const t3 = assertTransition('SM-MEM-002', pos.status, 'ended', 'end_change')
        if (t3.ok) {
          pos.endDate = new Date().toISOString().slice(0, 10)
          pos.status = 'ended'
        }
        // ORG-001/017：免职同步移除职位 Group 成员
        const sync = syncPositionMembership({ clubId: cmd.clubId, memberId: member.id, memberName: member.name, departmentName: pos.departmentName, title: pos.title, active: false })
        if (!sync.ok && sync.error) cmd.syncWarning = sync.error
      }
      member.tenures.unshift({ id: 'ten-' + Date.now(), departmentName: pos?.departmentName || '', title: pos?.title || '', startDate: pos?.startDate || '', endDate: new Date().toISOString().slice(0, 10), endReason: '免职' })
      member.departmentHistory.unshift({ id: 'dhis-' + Date.now(), action: 'leave', departmentName: pos?.departmentName || '', at: now })
    } else {
      // transfer 时先结束原 active 职位，再写入新职位
      if (cmd.action === 'transfer') {
        const oldPos = member.positions.find((p) => p.status === 'active')
        if (oldPos) {
          const t3 = assertTransition('SM-MEM-002', oldPos.status, 'ended', 'end_change')
          if (t3.ok) {
            oldPos.endDate = new Date().toISOString().slice(0, 10)
            oldPos.status = 'ended'
          }
          // ORG-001/017：调岗同步移除原职位 Group 成员
          const syncRemove = syncPositionMembership({ clubId: cmd.clubId, memberId: member.id, memberName: member.name, departmentName: oldPos.departmentName, title: oldPos.title, active: false })
          if (!syncRemove.ok && syncRemove.error) cmd.syncWarning = syncRemove.error
          member.tenures.unshift({ id: 'ten-' + Date.now(), departmentName: oldPos.departmentName, title: oldPos.title, startDate: oldPos.startDate, endDate: oldPos.endDate, endReason: '调岗' })
        }
      }
      member.positions.push({
        id: 'pos-' + Date.now(), departmentId: cmd.departmentId || '', departmentName: cmd.departmentName || '',
        title: cmd.title || '成员', startDate: new Date().toISOString().slice(0, 10), endDate: null, plannedEndDate: null, status: 'active',
      })
      // ORG-001/017：任命/调岗生效同步加入职位 Group 成员
      const syncAdd = syncPositionMembership({ clubId: cmd.clubId, memberId: member.id, memberName: member.name, departmentName: cmd.departmentName || null, title: cmd.title || '成员', active: true })
      if (!syncAdd.ok && syncAdd.error) cmd.syncWarning = syncAdd.error
      member.tenures.unshift({ id: 'ten-' + Date.now(), departmentName: cmd.departmentName || '', title: cmd.title || '成员', startDate: new Date().toISOString().slice(0, 10), endDate: null, endReason: null })
      member.departmentHistory.unshift({ id: 'dhis-' + Date.now(), action: cmd.action === 'transfer' ? 'transfer' : 'join', departmentName: cmd.departmentName || '', at: now })
    }
  }
  return { ok: true, command: cmd }
}

export function createResignationRequest(clubId: string, memberId: string, memberName: string, departmentName: string, title: string, reason: string): MockResignationRequest {
  const req: MockResignationRequest = {
    id: 'res-' + Date.now(), clubId, memberId, memberName, departmentName, title, reason,
    status: 'under_review', submittedAt: now, decidedAt: null, decidedBy: null,
    dueAt: daysFromNow(DEFAULT_PROCESSING_DAYS),
  }
  resignationRequests.unshift(req)
  return req
}

/** 撤回辞职申请：仅审批前可撤回，撤回后不影响任何职位/任期（MEM-002） */
export function withdrawResignationRequest(requestId: string, actorMemberId: string): { ok: boolean; error?: string; request?: MockResignationRequest } {
  const req = resignationRequests.find((r) => r.id === requestId)
  if (!req) return { ok: false, error: '申请不存在' }
  if (req.status !== 'under_review') return { ok: false, error: '仅待审批的辞职申请可撤回' }
  if (req.memberId !== actorMemberId) return { ok: false, error: '只能撤回自己的辞职申请' }
  req.status = 'withdrawn'
  return { ok: true, request: req }
}

/** 撤回部门关系申请：走 SM-MEM-003 状态机，与审批（decide）互斥——任一方成功即锁定（MEM-002）；
 * 默认仅申请人可撤回；管理端代为撤回（原接口行为）传 byManager=true，但不影响互斥 */
export function withdrawDepartmentApplication(appId: string, actorMemberId: string, byManager = false): { ok: boolean; error?: string; app?: MockDeptApplication } {
  const app = departmentApplications.find((a) => a.id === appId)
  if (!app) return { ok: false, error: '申请不存在' }
  if (app.status !== 'under_review') return { ok: false, error: '该申请已处理或已撤回，无法重复操作' }
  if (!byManager && app.applicantId !== actorMemberId) return { ok: false, error: '只能撤回自己的申请' }
  const t = assertTransition('SM-MEM-003', app.status, 'withdrawn', 'withdraw')
  if (!t.ok) return { ok: false, error: t.reason || '当前状态不可撤回' }
  app.status = 'withdrawn'
  return { ok: true, app }
}

/** 主动退出申请（成员视角）：创建退出申请进入审批队列，待负责人/人事批准（MEM-001）。
 * allowSelfExit=false 时拒绝发起（平台/社团配置项接入，避免配置形同虚设）。 */
export function createExitRequest(clubId: string, input: { memberId: string; memberName: string; reason: string; allowSelfExit?: boolean }): { ok: boolean; error?: string; request?: MockExitRequest } {
  if (input.allowSelfExit === false) return { ok: false, error: '当前社团不允许成员自行退出，请联系管理员' }
  const member = findMember(clubId, input.memberId)
  if (!member) return { ok: false, error: '成员不存在' }
  if (member.status !== 'active') return { ok: false, error: '仅在职成员可申请退出' }
  if ((member.status === 'active' && isLastLeader(clubId, member.id))) return { ok: false, error: '最后一名负责人不能无交接离社，请先安排交接' }
  if (exitRequests.some((r) => r.clubId === clubId && r.memberId === member.id && (r.status === 'under_review' || r.status === 'approved'))) {
    return { ok: false, error: '已有一份待处理的退出申请' }
  }
  const request: MockExitRequest = {
    id: 'exit-req-' + Date.now(), clubId, memberId: member.id, memberName: member.name,
    reason: input.reason, status: 'under_review',
    submittedAt: now, decidedAt: null, decidedBy: null, confirmedAt: null,
    dueAt: daysFromNow(DEFAULT_PROCESSING_DAYS),
  }
  exitRequests.unshift(request)
  return { ok: true, request }
}

/** 批准/驳回退出申请：批准后成员进入 SM-MEM-001 exiting 并结束全部部门职位，等待本人二次确认 */
export function decideExitRequest(requestId: string, decision: 'approve' | 'reject', actorInput: { id: string; name: string }): { ok: boolean; error?: string; request?: MockExitRequest } {
  const req = exitRequests.find((r) => r.id === requestId)
  if (!req) return { ok: false, error: '申请不存在' }
  if (req.status !== 'under_review') return { ok: false, error: '该申请已处理或已撤回，无法重复操作' }
  if (req.memberId === actorInput.id) return { ok: false, error: '不能审批自己的退出申请' }
  if (decision === 'reject') {
    req.status = 'rejected'
    req.decidedAt = now
    req.decidedBy = actorInput.name
    return { ok: true, request: req }
  }
  const member = findMember(req.clubId, req.memberId)
  if (!member) return { ok: false, error: '成员不存在' }
  if (isLastLeader(req.clubId, member.id)) return { ok: false, error: '最后一名负责人不能无交接离社，请先安排交接' }
  if (member.status === 'active') {
    const t = assertTransition('SM-MEM-001', member.status, 'exiting', 'exit_approved')
    if (!t.ok) return { ok: false, error: t.reason || '当前状态不可批准退出' }
    member.status = 'exiting'
  }
  // 批准后处理全部部门与职位关系（保留历史）
  member.positions.forEach((p) => {
    if (p.status === 'active') {
      const t = assertTransition('SM-MEM-002', p.status, 'ended', 'end_change')
      if (t.ok) { p.endDate = new Date().toISOString().slice(0, 10); p.status = 'ended' }
    }
  })
  for (const p of member.positions.filter((p) => p.status === 'ended' && p.endDate)) {
    if (!member.tenures.some((tn) => tn.startDate === p.startDate && tn.title === p.title && tn.departmentName === p.departmentName && tn.endReason === '主动退出')) {
      member.tenures.unshift({ id: 'ten-' + Date.now(), departmentName: p.departmentName, title: p.title, startDate: p.startDate, endDate: p.endDate, endReason: '主动退出' })
    }
  }
  for (const p of member.positions.filter((p) => p.status === 'ended' && p.endDate)) {
    if (!member.departmentHistory.some((h) => h.departmentName === p.departmentName && h.action === 'leave' && Number(new Date(h.at)) >= Number(new Date(p.endDate!)) - 1000 * 60)) {
      member.departmentHistory.unshift({ id: 'dhis-' + Date.now(), action: 'leave', departmentName: p.departmentName, at: now })
    }
  }
  req.status = 'approved'
  req.decidedAt = now
  req.decidedBy = actorInput.name
  return { ok: true, request: req }
}

/** 成员本人二次确认：approved 态的退出申请由本人确认后正式离社（exiting → exited） */
export function confirmExitRequest(requestId: string, actorMemberId: string): { ok: boolean; error?: string; request?: MockExitRequest } {
  const req = exitRequests.find((r) => r.id === requestId)
  if (!req) return { ok: false, error: '申请不存在' }
  if (req.status !== 'approved') return { ok: false, error: '仅已批准的退出申请可二次确认' }
  if (req.memberId !== actorMemberId) return { ok: false, error: '只能确认自己的退出申请' }
  const member = findMember(req.clubId, req.memberId)
  if (!member || member.status !== 'exiting') return { ok: false, error: '该成员当前不在待确认退出状态' }
  const t = assertTransition('SM-MEM-001', member.status, 'exited', 'confirmed')
  if (!t.ok) return { ok: false, error: t.reason || '当前状态不可确认退出' }
  member.status = 'exited'
  member.exitedAt = now
  req.status = 'exited'
  req.confirmedAt = now
  return { ok: true, request: req }
}

/** 撤回退出申请：仅审批前可撤回，成员保持在职状态 */
export function withdrawExitRequest(requestId: string, actorMemberId: string): { ok: boolean; error?: string; request?: MockExitRequest } {
  const req = exitRequests.find((r) => r.id === requestId)
  if (!req) return { ok: false, error: '申请不存在' }
  if (req.status !== 'under_review') return { ok: false, error: '仅待审批的退出申请可撤回' }
  if (req.memberId !== actorMemberId) return { ok: false, error: '只能撤回自己的退出申请' }
  const member = findMember(req.clubId, req.memberId)
  if (member && member.status === 'exiting') {
    const t = assertTransition('SM-MEM-001', member.status, 'active', 'failed')
    if (t.ok) member.status = 'active'
  }
  req.status = 'withdrawn'
  return { ok: true, request: req }
}

export function listExitRequests(clubId: string): MockExitRequest[] {
  return exitRequests.filter((r) => r.clubId === clubId)
}

/** 某成员的全部退出申请（自视角） */
export function exitRequestsOfMember(clubId: string, memberId: string): MockExitRequest[] {
  return exitRequests.filter((r) => r.clubId === clubId && r.memberId === memberId)
}

/** 辞职申请列表（含撤回入口供申请人自视角查看） */
export function resignationRequestsOfMember(clubId: string, memberId: string): MockResignationRequest[] {
  return resignationRequests.filter((r) => r.clubId === clubId && r.memberId === memberId)
}

export function decideResignationRequest(requestId: string, decision: 'approve' | 'reject', actorName: string): { ok: boolean; error?: string } {
  const req = resignationRequests.find((r) => r.id === requestId)
  if (!req) return { ok: false, error: '申请不存在' }
  if (req.status !== 'under_review') return { ok: false, error: '该申请已处理' }
  if (decision === 'reject') {
    req.status = 'rejected'
    req.decidedAt = now
    req.decidedBy = actorName
    return { ok: true }
  }
  if (isLastLeader(req.clubId, req.memberId)) return { ok: false, error: '最后一名负责人不能无交接离任，请先安排交接' }
  req.status = 'approved'
  req.decidedAt = now
  req.decidedBy = actorName
  const member = findMember(req.clubId, req.memberId)
  if (member) {
    const t = assertTransition('SM-MEM-001', member.status, 'exiting', 'exit_approved')
    if (!t.ok) return { ok: false, error: t.reason || '当前成员状态不可进入退出流程' }
    member.status = 'exiting'
    const pos = member.positions.find((p) => p.status === 'active' && p.departmentName === req.departmentName)
    if (pos) {
      const t2 = assertTransition('SM-MEM-002', pos.status, 'ended', 'end_change')
      if (t2.ok) {
        pos.endDate = new Date().toISOString().slice(0, 10)
        pos.status = 'ended'
      }
      // ORG-001/017：辞职批准同步移除职位 Group 成员
      const sync = syncPositionMembership({ clubId: req.clubId, memberId: member.id, memberName: member.name, departmentName: pos.departmentName, title: pos.title, active: false })
      if (!sync.ok && sync.error) req.syncWarning = sync.error
    }
    member.tenures.unshift({ id: 'ten-' + Date.now(), departmentName: req.departmentName, title: req.title, startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), endReason: '辞职' })
    member.departmentHistory.unshift({ id: 'dhis-' + Date.now(), action: 'leave', departmentName: req.departmentName, at: now })
  }
  return { ok: true }
}

export function listMembers(clubId: string): MockMember[] {
  return members.filter((m) => m.clubId === clubId)
}

export function getMemberProfile(clubId: string, memberId: string): MockMember | undefined {
  return findMember(clubId, memberId)
}

export function getMemberStats(clubId: string): { total: number; active: number; exited: number } {
  const list = listMembers(clubId)
  return { total: list.length, active: list.filter((m) => m.status === 'active').length, exited: list.filter((m) => m.status === 'exited').length }
}

/** 成员管理级别（MEM-006 角色白名单用）：由职位标题与 mock 用户角色综合判定 */
export type MemberManagerLevel = 'club_leader' | 'hr' | 'department_leader' | 'member'

export function memberManagerRole(clubId: string, memberId: string): MemberManagerLevel {
  const member = findMember(clubId, memberId)
  const activeTitles = member?.positions.filter((p) => p.status === 'active').map((p) => p.title) ?? []
  if (activeTitles.some((t) => t === '负责人' || t === '副负责人')) return 'club_leader'
  // 通过角色名映射回登录用户（种子数据：mem-003=人事，mem-006=部门负责人）
  const roleOfUser = Object.entries(MEMBER_BY_USER).find(([, map]) => map[clubId] === memberId)
  if (roleOfUser) {
    const key = roleOfUser[0]
    if (key === 'user-hr-001') return 'hr'
    if (key === 'user-deptleader-001' || activeTitles.some((t) => t === '部长')) return 'department_leader'
  }
  if (activeTitles.some((t) => t === '部长')) return 'department_leader'
  return 'member'
}

/** 移除/退出的操作者白名单（MEM-006）：被移除者角色 → 允许操作者角色集合 */
export function canRemoveMember(actor: MemberManagerLevel, target: MemberManagerLevel, actorIsLeaderTargetOther: boolean): { ok: boolean; reason?: string } {
  if (target === 'club_leader') {
    if (actor !== 'club_leader') return { ok: false, reason: '社团负责人只能由另一名现任负责人移除' }
    if (!actorIsLeaderTargetOther) return { ok: false, reason: '发起人不是另一名现任负责人，无权移除社团负责人' }
    return { ok: true }
  }
  if (target === 'hr') {
    return actor === 'club_leader' ? { ok: true } : { ok: false, reason: '人事管理员只能由社团负责人移除' }
  }
  if (target === 'department_leader') {
    return actor === 'club_leader' || actor === 'hr' ? { ok: true } : { ok: false, reason: '部门负责人只能由社团负责人或人事移除' }
  }
  // 普通成员：社团负责人/人事/本部门部门负责人均可
  return { ok: true }
}

/** 计划任期到期提醒（MEM-004）：按提前天数派生即将到期的在任职位；不改变实际任职状态 */
export function upcomingTermEnd(clubId: string, advanceDays: number): { memberId: string; memberName: string; position: MockPosition; daysLeft: number }[] {
  const out: { memberId: string; memberName: string; position: MockPosition; daysLeft: number }[] = []
  const nowMs = Date.now()
  for (const m of listMembers(clubId)) {
    if (m.status !== 'active') continue
    for (const p of m.positions) {
      if (p.status !== 'active' || !p.plannedEndDate) continue
      const endMs = new Date(p.plannedEndDate).getTime()
      const daysLeft = Math.ceil((endMs - nowMs) / (24 * 60 * 60 * 1000))
      if (daysLeft < 0 || daysLeft > advanceDays) continue
      out.push({ memberId: m.id, memberName: m.name, position: p, daysLeft })
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

/** 历史成员分段（MEM-007）：同学生账号的过往经历，用于重新加入时间线还原 */
export function historyMembershipsOf(clubId: string, studentId: string, currentMemberId?: string): { id: string; name: string; joinedAt: string; exitedAt: string | null; status: string }[] {
  return listMembers(clubId)
    .filter((m) => m.studentId === studentId && m.id !== currentMemberId && m.status === 'exited')
    .map((m) => ({ id: m.id, name: m.name, joinedAt: m.joinedAt, exitedAt: m.exitedAt, status: m.status }))
}

/**
 * 管理员直接移除成员（MEM-001/MEM-006）：
 * - 校验被移除者角色白名单与"另一名现任负责人"在场（canRemoveMember）
 * - 状态走 SM-MEM-001（active --removed--> exiting --confirmed--> exited），结束全部在任职位并落 tenure/departmentHistory
 */
export function directRemoveMember(clubId: string, byMemberId: string, memberId: string): { ok: boolean; error?: string; member?: MockMember } {
  if (memberId === byMemberId) return { ok: false, error: '不能移除自己' }
  const target = findMember(clubId, memberId)
  if (!target) return { ok: false, error: '成员不存在' }
  if (isLastLeader(clubId, memberId)) return { ok: false, error: '最后一名负责人不能无交接离社，请先安排交接' }
  const actorLevel = memberManagerRole(clubId, byMemberId)
  const targetLevel = memberManagerRole(clubId, memberId)
  const leaders = listMembers(clubId).filter(
    (m) => m.status === 'active' && m.positions.some((p) => p.status === 'active' && (p.title === '负责人' || p.title === '副负责人')),
  )
  const actorIsLeader = actorLevel === 'club_leader' && leaders.some((m) => m.id === byMemberId)
  const hasOtherLeader = leaders.filter((m) => m.id !== byMemberId).length > 0
  const gate = canRemoveMember(actorLevel, targetLevel, actorIsLeader && hasOtherLeader)
  if (!gate.ok) return { ok: false, error: gate.reason || '无权移除该成员' }
  const t1 = assertTransition('SM-MEM-001', target.status, 'exiting', 'removed')
  if (!t1.ok) return { ok: false, error: t1.reason || '当前成员状态不可移除' }
  target.status = 'exiting'
  const t2 = assertTransition('SM-MEM-001', target.status, 'exited', 'confirmed')
  if (t2.ok) {
    target.status = 'exited'
    target.exitedAt = new Date().toISOString()
  }
  const now = new Date().toISOString()
  const endedAt = now.slice(0, 10)
  for (const p of target.positions.filter((p) => p.status === 'active')) {
    const tp = assertTransition('SM-MEM-002', p.status, 'ended', 'end_change')
    if (tp.ok) {
      p.endDate = endedAt
      p.status = 'ended'
      target.tenures.unshift({
        id: 'ten-' + Date.now() + '-' + Math.floor(Math.random() * 1000), departmentName: p.departmentName, title: p.title,
        startDate: p.startDate, endDate: endedAt, endReason: '被移除',
      })
      target.departmentHistory.unshift({ id: 'dhis-' + Date.now() + '-' + Math.floor(Math.random() * 1000), action: 'leave', departmentName: p.departmentName, at: now })
    }
  }
  return { ok: true, member: target }
}

/**
 * 管理员标记成员退出（软退出，与「移除」语义区分）：
 * - 只记录退出时间（exitedAt），保留成员/部门/职位档案（职位不结束、状态机不流转）
 * - 不触发「被移出」通知、不做角色白名单硬移除，供审计回溯主动退出路径
 * - 与 remove 共用管理端入口（action=mark_exit），但行为、文案、通知均不同
 */
export function markMemberExit(clubId: string, byMemberId: string, memberId: string): { ok: boolean; error?: string; member?: MockMember } {
  if (memberId === byMemberId) return { ok: false, error: '不能标记自己退出' }
  const target = findMember(clubId, memberId)
  if (!target) return { ok: false, error: '成员不存在' }
  if (target.status !== 'active') return { ok: false, error: '仅在职成员可标记退出' }
  if (isLastLeader(clubId, memberId)) return { ok: false, error: '最后一名负责人不能无交接离社，请先安排交接' }
  // 与 remove 一致的操作者白名单：部门负责人不能标记负责人/人事退出
  const actorLevel = memberManagerRole(clubId, byMemberId)
  const targetLevel = memberManagerRole(clubId, memberId)
  const leaders = listMembers(clubId).filter(
    (m) => m.status === 'active' && m.positions.some((p) => p.status === 'active' && (p.title === '负责人' || p.title === '副负责人')),
  )
  const actorIsLeader = actorLevel === 'club_leader' && leaders.some((m) => m.id === byMemberId)
  const hasOtherLeader = leaders.filter((m) => m.id !== byMemberId).length > 0
  const gate = canRemoveMember(actorLevel, targetLevel, actorIsLeader && hasOtherLeader)
  if (!gate.ok) return { ok: false, error: gate.reason || '无权标记该成员退出' }
  target.status = 'exited'
  target.exitedAt = new Date().toISOString()
  return { ok: true, member: target }
}
