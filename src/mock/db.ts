/**
 * Mock 层有状态内存库：成员生命周期
 * 单一数据源，页面刷新即重置；状态流转经 state-machines 校验
 */

import { assertTransition } from './state-machines/transitions'

/** 登录账号 id → 其所属社团成员 id（在 db.members 中按「用户 × 社团」唯一）
 * 原静态映射 auth.USER_MEMBER_MAP 仅按用户维度映射，无法表达多社团用户在不同社团的成员 id，
 * 切换社团后 memberId 会沿用上一社团的值导致自审误判；改为由 members 种子推导单源解析。 */
export const MEMBER_BY_USER: Record<string, Record<string, string>> = {
  'user-leader-001': { 'club-001': 'mem-004', 'club-002': 'mem-101' },
  'user-hr-001': { 'club-001': 'mem-003' },
  'user-interviewer-001': { 'club-001': 'mem-002' },
  'user-member-001': { 'club-001': 'mem-001' },
  'user-deptleader-001': { 'club-001': 'mem-006' },
}

/** 按「用户 × 社团」解析成员 id；该用户在目标社团无成员身份（或数据未种子）时返回 null */
export function resolveMemberId(userId: string, clubId: string): string | null {
  return MEMBER_BY_USER[userId]?.[clubId] ?? null
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
  status: 'non_member' | 'pending_effective' | 'active' | 'exiting' | 'exited' | 'removed'
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
}

export interface MockCandidateUser {
  id: string
  studentId: string
  name: string
  isMember: boolean
}

const now = new Date().toISOString()

function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

export const departments: MockDepartment[] = [
  { id: 'dept-001', name: '技术部' },
  { id: 'dept-002', name: '运营部' },
  { id: 'dept-003', name: '设计部' },
  { id: 'dept-004', name: '人事部' },
]

export const candidates: MockCandidateUser[] = [
  { id: 'cand-001', studentId: '20240010', name: '周明轩', isMember: false },
  { id: 'cand-002', studentId: '20240011', name: '孙佳琪', isMember: false },
  { id: 'cand-003', studentId: '20240012', name: '郑浩宇', isMember: false },
  { id: 'cand-004', studentId: '20210005', name: '陈雨桐', isMember: true },
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
      { id: 'pos-001', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, status: 'active' },
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
      { id: 'pos-002', departmentId: 'dept-001', departmentName: '技术部', title: '副部长', startDate: '2024-09-01', endDate: null, status: 'active' },
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
      { id: 'pos-003', departmentId: 'dept-004', departmentName: '人事部', title: '部长', startDate: '2024-09-01', endDate: null, status: 'active' },
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
      { id: 'pos-004', departmentId: 'dept-001', departmentName: '技术部', title: '负责人', startDate: '2024-09-01', endDate: null, status: 'active' },
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
      { id: 'pos-006', departmentId: 'dept-001', departmentName: '技术部', title: '部长', startDate: '2024-09-01', endDate: null, status: 'active' },
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
    id: 'mem-101', clubId: 'club-002', studentId: '20210002',
    name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002',
    status: 'active', joinedAt: '2024-03-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-101', departmentId: 'dept-101', departmentName: '嵌入式组', title: '人事', startDate: '2024-03-01', endDate: null, status: 'active' },
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
      { id: 'pos-005', departmentId: 'dept-001', departmentName: '技术部', title: '成员', startDate: '2023-09-01', endDate: '2024-06-01', status: 'ended' },
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
    execFailOn: 'first', execRetried: false,
  },
  {
    id: 'dap-002', clubId: 'club-001', applicantId: 'mem-002', applicantName: '王浩然',
    type: 'join', currentDept: '-', targetDeptId: 'dept-003', targetDeptName: '设计部',
    reason: '对设计工作感兴趣', status: 'under_review',
    submittedAt: '2025-07-20T10:00:00+08:00', decidedAt: null, decidedBy: null, rejectReason: null,
    execFailOn: 'none', execRetried: false,
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
    departmentId: 'dept-003', departmentName: '设计部', title: '副部长',
    scheduledAt: null, status: 'pending_exec', createdAt: '2025-07-28T10:00:00+08:00', createdBy: '张明远',
    executedAt: null, failReason: null, execFailOn: 'first', execRetried: false,
  },
  {
    id: 'apc-002', clubId: 'club-001', action: 'dismiss', memberId: 'mem-002', memberName: '王浩然',
    departmentId: null, departmentName: null, title: null,
    scheduledAt: daysFromNow(2), status: 'initiator_lost_rights', createdAt: '2025-07-20T10:00:00+08:00', createdBy: '张明远',
    executedAt: null, failReason: '发起人已失去对应权限', execFailOn: 'none', execRetried: false,
  },
]

export const resignationRequests: MockResignationRequest[] = [
  {
    id: 'res-001', clubId: 'club-001', memberId: 'mem-002', memberName: '王浩然',
    departmentName: '技术部', title: '副部长', reason: '学业压力较大',
    status: 'under_review', submittedAt: '2025-07-29T10:00:00+08:00', decidedAt: null, decidedBy: null,
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
        title: '成员', startDate: new Date().toISOString().slice(0, 10), endDate: null, status: 'active',
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
    inv.status = 'effective'
    members.push({
      id: 'mem-' + Date.now(), clubId: inv.clubId, studentId: inv.candidateStudentId, name: inv.candidateName,
      email: 'new@example.edu.cn', phone: '13900000000', status: 'active',
      joinedAt: now, exitedAt: null,
      positions: inv.departmentId ? [{ id: 'pos-' + Date.now(), departmentId: inv.departmentId, departmentName: inv.departmentName || '', title: '成员', startDate: new Date().toISOString().slice(0, 10), endDate: null, status: 'active' }] : [],
      tenures: [], departmentHistory: [], anomalies: [],
    })
    return { ok: true, invitation: inv }
  }
  return { ok: false, error: '仅接受待同步的邀请可确认生效' }
}

export function createAppointmentCommand(clubId: string, input: { action: AppointmentAction; memberId: string; memberName: string; departmentId: string | null; departmentName: string | null; title: string | null; scheduledAt: string | null; actorName: string }): { ok: boolean; error?: string; command?: MockAppointmentCommand } {
  if (input.action === 'dismiss' && input.memberId) {
    const member = findMember(clubId, input.memberId)
    const isLeader = !!member?.positions.find((p) => p.status === 'active' && p.title === '负责人')
    if (isLeader && isLastLeader(clubId, input.memberId)) return { ok: false, error: '最后一名负责人不能无交接离任，请先安排交接' }
  }
  const command: MockAppointmentCommand = {
    id: 'apc-' + Date.now(), clubId, action: input.action,
    memberId: input.memberId, memberName: input.memberName,
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
  const member = findMember(cmd.clubId, cmd.memberId)
  if (member) {
    if (cmd.action === 'dismiss') {
      const pos = member.positions.find((p) => p.status === 'active')
      if (pos) {
        const t3 = assertTransition('SM-MEM-002', pos.status, 'ended', 'end_change')
        if (t3.ok) {
          pos.endDate = new Date().toISOString().slice(0, 10)
          pos.status = 'ended'
        }
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
          member.tenures.unshift({ id: 'ten-' + Date.now(), departmentName: oldPos.departmentName, title: oldPos.title, startDate: oldPos.startDate, endDate: oldPos.endDate, endReason: '调岗' })
        }
      }
      member.positions.push({
        id: 'pos-' + Date.now(), departmentId: cmd.departmentId || '', departmentName: cmd.departmentName || '',
        title: cmd.title || '成员', startDate: new Date().toISOString().slice(0, 10), endDate: null, status: 'active',
      })
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
  }
  resignationRequests.unshift(req)
  return req
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
  return { total: list.length, active: list.filter((m) => m.status === 'active').length, exited: list.filter((m) => m.status === 'exited' || m.status === 'removed').length }
}
