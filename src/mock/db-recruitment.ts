/**
 * Mock 有状态库：普通招新（REC）+ 多社团联合（JNT）+ 邀请（INV）
 * 状态流转经 state-machines/transitions.ts 校验；业务前置条件在此层守卫
 */
import { assertTransition, type StatesOf } from './state-machines/transitions'
import { mockUsers } from './auth'
import { createMemberFromAdmission, candidates } from './db'

/** 申请人档案（applicantId → 姓名/学号）：申请人 id 为 u-xxx 域内编号，
 * 与 auth.mockUsers 的 user-applicant-xxx 键不同，按申请人域自维护；
 * 动态注册的 u-auto-* 档案由 ensureApplicantProfile 写入，resetRecruitmentDB 会还原种子 */
export const APPLICANT_PROFILES: Record<string, { name: string; studentId: string }> = {
  'u-001': { name: '刘子豪', studentId: '20240001' },
  'u-002': { name: '陈雨彤', studentId: '20240002' },
  'u-003': { name: '王梓涵', studentId: '20240003' },
  'u-004': { name: '张博文', studentId: '20240004' },
  'u-005': { name: '李欣怡', studentId: '20240005' },
  'u-006': { name: '林婉婷', studentId: '20240006' },
}

export function applicantNameOf(applicantId: string): string {
  return APPLICANT_PROFILES[applicantId]?.name || ''
}

export function applicantStudentIdOf(applicantId: string): string {
  return APPLICANT_PROFILES[applicantId]?.studentId || ''
}

/** 动态申请人档案：按学号反查已有档案（成员与申请人同人复用），未命中注册 u-auto-* 档案 */
let autoProfileSeq = 0

export function ensureApplicantProfile(studentId: string, name: string): string {
  const existing = Object.entries(APPLICANT_PROFILES).find(([, p]) => p.studentId === studentId)
  if (existing) return existing[0]
  autoProfileSeq += 1
  const id = `u-auto-${Date.now().toString(36)}-${autoProfileSeq.toString(36)}`
  APPLICANT_PROFILES[id] = { name, studentId }
  return id
}

/** 申请人联系方式解析：优先以档案学号命中已登录用户（auth.mockUsers）的联系方式，
 * 其次匹配候选人档案（candidates），避免录取确认后新成员 email/phone 为空串（P2-1 回归）。
 * 注意：auth 在模块顶部导入 db（resolveMemberId），此处仅取 mockUsers 数据，不反向导入，无循环依赖。 */
function resolveApplicantContact(studentId: string): { email: string; phone: string } {
  const user = Object.values(mockUsers).find((u) => u.studentId === studentId)
  if (user) return { email: user.email, phone: user.phone }
  const candidate = candidates.find((c) => c.studentId === studentId)
  if (candidate) return { email: candidate.email, phone: candidate.phone }
  return { email: '', phone: '' }
}

const now = () => new Date().toISOString()
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}
/** 面试时段：以起点加 1 小时为终点，保证区间检测（overlaps）有效 */
export function plusHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString()
}

function err(message: string): { ok: false; error: string } {
  return { ok: false, error: message }
}
function ok<T>(data?: T): { ok: true; data?: T } {
  return data === undefined ? { ok: true } : { ok: true, data }
}

/**
 * MRM-014：以下类型词表一律由 state-machines/transitions.ts 的转换表（StatesOf<M>）派生，
 * 不再手工抄写字面量，避免状态机枚举与 db 类型词表双轨漂移。
 */
export type RecActivityStatus = StatesOf<'SM-REC-001'>
export type ChannelStatus = StatesOf<'SM-REC-002'>
/**
 * 申请状态：SM-REC-003 机器状态 + 'accepted'（业务终态：录取邀请被接受后置位，
 * 不在 SM-REC-003 转换表内，由 SM-INV-001 接受链路派生）
 */
export type ApplicationStatus = StatesOf<'SM-REC-003'> | 'accepted'
export type DeptPathStatus = StatesOf<'SM-REC-004'>
export type InterviewStatus = StatesOf<'SM-REC-005'>
export type RecInvitationStatus = StatesOf<'SM-INV-001'>

/** 标签变更历史记录（REC-039：谁、何时、何种操作） */
export interface LabelHistoryEntry {
  actorName: string
  actorId: string
  action: 'set' | 'clear' | 'override'
  timestamp: string
}

export interface RecDeptPath {
  departmentId: string
  departmentName: string
  order: number
  source: 'volunteer' | 'adjustment'
  status: DeptPathStatus
  decided: 'admit' | 'not_admit' | null
  labelSetBy: string | null
  /** 标签设置者的可通知用户 id（REC-039/改判通知用；显式存储避免按姓名反查同名歧义） */
  labelSetByUserId: string | null
  waitlist: boolean
  holdDeadline: string | null
  publishedAt: string | null
  labelHistory: LabelHistoryEntry[]
  version: number
}

export interface RecApplication {
  id: string
  activityId: string
  clubId: string
  applicantId: string
  applicantName: string
  studentId: string
  status: ApplicationStatus
  preferences: { order: number; departmentId: string; departmentName: string }[]
  allowAdjustment: boolean
  formVersion: number
  answers: Record<string, unknown>
  paths: Record<string, RecDeptPath>
  submittedAt: string | null
  withdrawnAt: string | null
  recoveryWindowDeadline: string | null
  adjustmentDeadline: string | null
  adjustmentReason: string | null
  notQualifiedReason: string | null
  identityAnomalyAt: string | null
  /** 资格快照（提交时固化，用于后续审计与 REC-035 回放） */
  eligibilitySnapshot: {
    answers: Record<string, unknown>
    preferences: { departmentId: string; departmentName: string; order: number }[]
    submittedAt: string
    formVersion: number
  } | null
  version: number
}

export interface RecSlot {
  id: string
  roundId: string
  startAt: string
  endAt: string
  capacity: number
  taken: number
}

export interface RecRound {
  id: string
  name: string
  status: 'open' | 'closed' | 'cancelled'
  mode: 'club_unified' | 'dept_separate'
  selectDeadline: string
  slots: RecSlot[]
}

export interface RecInterview {
  id: string
  activityId: string
  clubId: string
  applicantId: string
  applicantName: string
  roundId: string
  status: InterviewStatus
  slotId: string | null
  startAt: string | null
  endAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  attendance: 'none' | 'leave' | 'late' | 'absent' | 'present'
  invalidReason: string | null
  skipReason: string | null
  cancelReason: string | null
  interviewerIds: string[]
  version: number
}

export interface RecReview {
  id: string
  activityId: string
  applicantId: string
  authorId: string
  authorName: string
  authorRole: string
  comment: string
  rating: number
  roundId?: string | null
  history?: { comment: string; version: number; updatedAt: string }[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface RecInvitation {
  id: string
  activityId: string
  clubId: string
  applicantId: string
  applicantName: string
  departmentId: string
  departmentName: string
  status: RecInvitationStatus
  sentAt: string
  expiredAt: string
  acceptedAt: string | null
  casdoorSync: 'none' | 'processing' | 'confirmed' | 'failed'
  version: number
}

export interface RecActivity {
  id: string
  clubId: string
  clubName: string
  title: string
  description: string
  status: RecActivityStatus
  channelStatus: ChannelStatus
  channelBeforePause: ChannelStatus | null
  pauseStartAt: string | null
  deadline: string
  deadlineVersion: number
  window: { seq: number; deadline: string }
  formId: string
  formVersion: number
  departments: { id: string; name: string }[]
  eligibility: { colleges: string[]; grades: string[] }
  volunteerRules: { min: number; max: number }
  allowAdjustmentDefault: boolean
  conclusionMode: 'club_unified' | 'dept_separate'
  rounds: RecRound[]
  applicantIds: string[]
  invitationIds: string[]
  reviewIds: string[]
  publishedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  archivedAt: string | null
  version: number
  createdAt: string
}

// ================= 联合 =================

/** MRM-014：联合域类型词表同样由状态机转换表派生（StatesOf<M>），与普通招新域共用同一数据源 */
export type JointStatus = StatesOf<'SM-JNT-001'>
export type JointClubStatus = StatesOf<'SM-JNT-002'>
export type JointApplicationStatus = StatesOf<'SM-JNT-003'>
export type JointInterviewStatus = StatesOf<'SM-JNT-004'>
export type JointConclusionStatus = StatesOf<'SM-JNT-005'>
export type JointInvitationStatus = StatesOf<'SM-INV-001'>

export interface JointClub {
  clubId: string
  clubName: string
  status: JointClubStatus
  confirmedAt: string | null
  confirmedBy: string | null
  suspendedSince: string | null
  departments: { id: string; name: string }[]
}

export interface JointActivity {
  id: string
  title: string
  description: string
  status: JointStatus
  clubs: JointClub[]
  confirmRound: number
  confirmDeadline: string
  sharedAgreement: { version: number; text: string }
  formId: string
  formVersion: number
  channelStatus: ChannelStatus
  channelPausedBefore: ChannelStatus | null
  pauseStartAt: string | null
  /** 报名通道首次开放时间（JNT-029） */
  channelOpenedAt: string | null
  deadline: string
  deadlineVersion: number
  window: { seq: number; deadline: string }
  publishedAt: string | null
  firstInviteAt: string | null
  closedAt: string | null
  forceClosedAt: string | null
  cancelConfirmRound: number
  cancelConfirmDeadline: string | null
  cancelConfirmations: Record<string, string>
  endConfirmRound: number
  endConfirmDeadline: string | null
  endConfirmations: Record<string, string>
  applicantIds: string[]
  version: number
  createdAt: string
}

export interface JointApplication {
  id: string
  jointId: string
  applicantId: string
  applicantName: string
  studentId: string
  status: JointApplicationStatus
  consented: boolean
  consentAt: string | null
  agreementVersion: number | null
  allowJointAdjustment: boolean
  volunteerClubIds: string[]
  volunteerClubSnapshot: string[]
  preferences: { departmentId: string; departmentName: string }[]
  agreementClubSnapshot: string[]
  answers: Record<string, unknown>
  formVersion: number
  submittedAt: string | null
  version: number
}

export interface JointInterview {
  id: string
  jointId: string
  applicantId: string
  applicantName: string
  status: JointInterviewStatus
  slotId: string | null
  startAt: string | null
  endAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  attendance: 'none' | 'leave' | 'late' | 'absent' | 'present'
  invalidReason: string | null
  attempt: number
  version: number
}

export interface JointConclusionVersion {
  conclusion: 'admit' | 'not_admit'
  changedBy: string
  changedByRole: string
  reason: string | null
  at: string
}

export interface JointConclusion {
  id: string
  jointId: string
  applicantId: string
  clubId: string
  clubName: string
  status: JointConclusionStatus
  conclusion: 'admit' | 'not_admit' | null
  reviewFlag: boolean
  inviteId: string | null
  versions: JointConclusionVersion[]
  version: number
}

export interface JointInvitation {
  id: string
  jointId: string
  clubId: string
  applicantId: string
  type: 'admit' | 'join'
  status: JointInvitationStatus
  sentAt: string
  expiredAt: string
  acceptedAt: string | null
  reviewFlag: boolean
  frozenRemainingMs: number | null
  casdoorSync: 'none' | 'processing' | 'confirmed' | 'failed'
  version: number
}

/** 联合结论补充评价（US-JNT-03：各社团评分/评语互见，持久化于 db 层） */
export interface JointReviewExtra {
  jointId: string
  applicantId: string
  clubId: string
  rating: number | null
  comment: string
  concludedAt: string | null
  authorName: string
  authorRole: string
  version: number
  /** JNT-012：修改时保留旧值、新值、时间（与 RecReview.history 契约一致，updatedAt 供跨社互见展示修改时间） */
  history: { rating: number | null; comment: string; concludedAt: string | null; version: number; updatedAt: string }[]
}

// ================= 种子数据 =================

export const recruitmentActivities: RecActivity[] = [
  {
    id: 'act-001', clubId: 'club-001', clubName: '计算机协会',
    title: '2025 秋季招新',
    description: '面向全校新生的秋季招新活动，技术部、运营部、设计部三大方向火热招募中！',
    status: 'in_progress', channelStatus: 'open', channelBeforePause: null, pauseStartAt: null,
    deadline: daysFromNow(45), deadlineVersion: 1,
    window: { seq: 1, deadline: daysFromNow(45) },
    formId: 'form-001', formVersion: 1,
    departments: [
      { id: 'dept-001', name: '技术部' },
      { id: 'dept-002', name: '运营部' },
      { id: 'dept-003', name: '设计部' },
    ],
    eligibility: { colleges: [], grades: [] },
    volunteerRules: { min: 1, max: 3 },
    allowAdjustmentDefault: true,
    conclusionMode: 'dept_separate',
    rounds: [
      {
        id: 'rd-001', name: '第一轮', status: 'open', mode: 'dept_separate',
        selectDeadline: daysFromNow(40),
        slots: [
          { id: 'slot-001', roundId: 'rd-001', startAt: daysFromNow(35), endAt: plusHours(daysFromNow(35), 1), capacity: 30, taken: 12 },
          { id: 'slot-002', roundId: 'rd-001', startAt: daysFromNow(36), endAt: plusHours(daysFromNow(36), 1), capacity: 30, taken: 8 },
        ],
      },
      {
        id: 'rd-002', name: '第二轮', status: 'open', mode: 'dept_separate',
        selectDeadline: daysFromNow(48),
        slots: [
          { id: 'slot-003', roundId: 'rd-002', startAt: daysFromNow(42), endAt: plusHours(daysFromNow(42), 1), capacity: 20, taken: 0 },
        ],
      },
    ],
    applicantIds: ['app-001', 'app-002', 'app-003', 'app-004', 'app-005'],
    invitationIds: ['rinv-001'],
    reviewIds: ['rev-001'],
    publishedAt: daysFromNow(-22), completedAt: null, cancelledAt: null, archivedAt: null,
    version: 2, createdAt: daysFromNow(-30),
  },
  {
    id: 'act-002', clubId: 'club-002', clubName: '电子设计协会',
    title: '嵌入式方向招新',
    description: '嵌入式开发方向招新，欢迎对单片机与软硬件结合感兴趣的同学。',
    status: 'in_progress', channelStatus: 'open', channelBeforePause: null, pauseStartAt: null,
    deadline: daysFromNow(25), deadlineVersion: 1,
    window: { seq: 1, deadline: daysFromNow(25) },
    formId: 'form-001', formVersion: 1,
    departments: [
      { id: 'dept-101', name: '嵌入式组' },
      { id: 'dept-102', name: '硬件组' },
    ],
    eligibility: { colleges: [], grades: [] },
    volunteerRules: { min: 1, max: 2 },
    allowAdjustmentDefault: true,
    conclusionMode: 'dept_separate',
    rounds: [
      {
        id: 'rd-101', name: '第一轮', status: 'open', mode: 'dept_separate',
        selectDeadline: daysFromNow(22),
        slots: [
          { id: 'slot-101', roundId: 'rd-101', startAt: daysFromNow(18), endAt: daysFromNow(18), capacity: 20, taken: 4 },
        ],
      },
    ],
    applicantIds: [], invitationIds: [], reviewIds: [],
    publishedAt: daysFromNow(-14), completedAt: null, cancelledAt: null, archivedAt: null,
    version: 1, createdAt: daysFromNow(-20),
  },
  {
    id: 'act-003', clubId: 'club-001', clubName: '计算机协会',
    title: '2025 春季补录',
    description: '春季补录活动',
    status: 'draft', channelStatus: 'not_open', channelBeforePause: null, pauseStartAt: null,
    deadline: daysFromNow(30), deadlineVersion: 1,
    window: { seq: 1, deadline: daysFromNow(30) },
    formId: 'form-001', formVersion: 1,
    departments: [{ id: 'dept-001', name: '技术部' }],
    eligibility: { colleges: [], grades: [] },
    volunteerRules: { min: 1, max: 1 },
    allowAdjustmentDefault: false,
    conclusionMode: 'club_unified',
    rounds: [],
    applicantIds: [], invitationIds: [], reviewIds: [],
    publishedAt: null, completedAt: null, cancelledAt: null, archivedAt: null,
    version: 1, createdAt: daysFromNow(-200),
  },
]

export const recruitmentApplications: RecApplication[] = [
  {
    id: 'app-001', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-001', applicantName: '刘子豪', studentId: '20240001',
    status: 'submitted',
    preferences: [
      { order: 1, departmentId: 'dept-001', departmentName: '技术部' },
      { order: 2, departmentId: 'dept-003', departmentName: '设计部' },
    ],
    allowAdjustment: true, formVersion: 1, answers: {},
    paths: {
      'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, labelSetByUserId: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 },
      'dept-003': { departmentId: 'dept-003', departmentName: '设计部', order: 2, source: 'volunteer', status: 'pending', decided: null, labelSetBy: null, labelSetByUserId: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 },
    },
    submittedAt: daysFromNow(-31), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, eligibilitySnapshot: null,
    version: 1,
  },
  {
    id: 'app-002', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-002', applicantName: '陈雨彤', studentId: '20240002',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }],
    allowAdjustment: true, formVersion: 1, answers: {},
    paths: {
      'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, labelSetByUserId: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 },
    },
    submittedAt: daysFromNow(-31), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, eligibilitySnapshot: null,
    version: 1,
  },
  {
    id: 'app-003', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-003', applicantName: '王梓涵', studentId: '20240003',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-001', departmentName: '技术部' }],
    allowAdjustment: false, formVersion: 1, answers: {},
    paths: {
      'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'waitlist', decided: null, labelSetBy: '李思颖', labelSetByUserId: 'user-hr-001', waitlist: true, holdDeadline: null, publishedAt: null, labelHistory: [], version: 2 },
    },
    submittedAt: daysFromNow(-32), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, eligibilitySnapshot: null,
    version: 1,
  },
  {
    id: 'app-004', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-004', applicantName: '张博文', studentId: '20240004',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }],
    allowAdjustment: false, formVersion: 1, answers: {},
    paths: {
      'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'published', decided: 'not_admit', labelSetBy: null, labelSetByUserId: null, waitlist: false, holdDeadline: null, publishedAt: daysFromNow(-28), labelHistory: [], version: 2 },
    },
    submittedAt: daysFromNow(-32), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, eligibilitySnapshot: null,
    version: 1,
  },
  {
    id: 'app-005', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-005', applicantName: '李欣怡', studentId: '20240005',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }],
    allowAdjustment: true, formVersion: 1, answers: {},
    paths: {
      'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, labelSetByUserId: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 },
    },
    submittedAt: daysFromNow(-32), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, eligibilitySnapshot: null,
    version: 1,
  },
]

export const recruitmentInterviews: RecInterview[] = [
  {
    id: 'int-001', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-001', applicantName: '刘子豪', roundId: 'rd-001',
    status: 'scheduled', slotId: 'slot-001', startAt: daysFromNow(35), endAt: plusHours(daysFromNow(35), 1),
    actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, skipReason: null, cancelReason: null,
    interviewerIds: ['user-interviewer-001'],
    version: 1,
  },
  {
    id: 'int-002', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-002', applicantName: '陈雨彤', roundId: 'rd-001',
    status: 'pending_selection', slotId: null, startAt: null, endAt: null,
    actualStartAt: null, actualEndAt: null, attendance: 'none',
    invalidReason: null, skipReason: null, cancelReason: null,
    interviewerIds: ['user-interviewer-001'],
    version: 1,
  },
]

export const recruitmentReviews: RecReview[] = [
  {
    id: 'rev-001', activityId: 'act-001', applicantId: 'u-002',
    authorId: 'mem-004', authorName: '张明远', authorRole: 'club_leader',
    comment: '基础扎实，表达清晰', rating: 4, version: 1,
    createdAt: daysFromNow(-26), updatedAt: daysFromNow(-26),
  },
]

export const recruitmentInvitations: RecInvitation[] = [
  {
    id: 'rinv-001', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-002', applicantName: '陈雨彤',
    departmentId: 'dept-001', departmentName: '技术部',
    status: 'pending_acceptance', sentAt: daysFromNow(-22), expiredAt: daysFromNow(5),
    acceptedAt: null, casdoorSync: 'none', version: 1,
  },
]

/** 各社团招新部门（联合活动拟参与社团展示用；与 act-001/act-002 种子一致） */
const JOINT_CLUB_DEPARTMENTS: Record<string, { id: string; name: string }[]> = {
  'club-001': [
    { id: 'dept-001', name: '技术部' },
    { id: 'dept-002', name: '运营部' },
    { id: 'dept-003', name: '设计部' },
  ],
  'club-002': [
    { id: 'dept-101', name: '嵌入式组' },
    { id: 'dept-102', name: '硬件组' },
  ],
  'club-003': [{ id: 'dept-201', name: '训练部' }],
}

export const jointActivities: JointActivity[] = [
  {
    id: 'jnt-001', title: '2025 计算机与电子设计联合招新', description: '两个协会联合开展的新生招新面试',
    status: 'published',
    clubs: [
      { clubId: 'club-001', clubName: '计算机协会', status: 'locked', confirmedAt: daysFromNow(-27), confirmedBy: '张明远', suspendedSince: null, departments: JOINT_CLUB_DEPARTMENTS['club-001'] },
      { clubId: 'club-002', clubName: '电子设计协会', status: 'locked', confirmedAt: daysFromNow(-27), confirmedBy: '林晓峰', suspendedSince: null, departments: JOINT_CLUB_DEPARTMENTS['club-002'] },
    ],
    confirmRound: 1, confirmDeadline: daysFromNow(10),
    sharedAgreement: { version: 1, text: '您的报名资料将在两个参与社团之间共享，用于联合面试与选拔。您可以在提交前选择是否同意共享；拒绝共享则不能参加本次联合活动。' },
    formId: 'form-001', formVersion: 1,
    channelStatus: 'open', channelPausedBefore: null, pauseStartAt: null, channelOpenedAt: daysFromNow(-26),
    deadline: daysFromNow(10), deadlineVersion: 1,
    window: { seq: 1, deadline: daysFromNow(10) },
    publishedAt: daysFromNow(-26), firstInviteAt: null, closedAt: null, forceClosedAt: null,
    cancelConfirmRound: 0, cancelConfirmDeadline: null, cancelConfirmations: {},
    endConfirmRound: 0, endConfirmDeadline: null, endConfirmations: {},
    applicantIds: ['japp-001', 'japp-002'],
    version: 1, createdAt: daysFromNow(-29),
  },
]

export const jointApplications: JointApplication[] = [
  {
    id: 'japp-001', jointId: 'jnt-001', applicantId: 'u-006', applicantName: '林婉婷', studentId: '20240006',
    status: 'submitted', consented: true, consentAt: daysFromNow(-25),
    agreementVersion: 1, allowJointAdjustment: true, volunteerClubIds: ['club-001', 'club-002'], volunteerClubSnapshot: ['计算机协会', '电子设计协会'], preferences: [{ departmentId: 'dept-001', departmentName: '技术部' }], agreementClubSnapshot: ['计算机协会', '电子设计协会'],
    answers: {}, formVersion: 1,
    submittedAt: daysFromNow(-25), version: 1,
  },
  {
    id: 'japp-002', jointId: 'jnt-001', applicantId: 'u-001', applicantName: '刘子豪', studentId: '20240001',
    status: 'draft', consented: false, consentAt: null,
    agreementVersion: 1, allowJointAdjustment: false, volunteerClubIds: [], volunteerClubSnapshot: [], preferences: [], agreementClubSnapshot: [],
    answers: {}, formVersion: 1,
    submittedAt: null, version: 1,
  },
]

export const jointInterviews: JointInterview[] = [
  {
    id: 'jint-001', jointId: 'jnt-001', applicantId: 'u-006', applicantName: '林婉婷',
    status: 'scheduled', slotId: 'jslot-001', startAt: daysFromNow(2), endAt: plusHours(daysFromNow(2), 1),
    actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null,
    attempt: 1, version: 1,
  },
]

export const jointConclusions: JointConclusion[] = [
  {
    id: 'jcon-001', jointId: 'jnt-001', applicantId: 'u-006', clubId: 'club-001', clubName: '计算机协会',
    status: 'evaluating', conclusion: null, reviewFlag: false, inviteId: null, versions: [], version: 1,
  },
  {
    id: 'jcon-002', jointId: 'jnt-001', applicantId: 'u-006', clubId: 'club-002', clubName: '电子设计协会',
    status: 'evaluating', conclusion: null, reviewFlag: false, inviteId: null, versions: [], version: 1,
  },
]

export const jointInvitations: JointInvitation[] = []

export const jointReviewExtras: JointReviewExtra[] = [
  {
    jointId: 'jnt-001', applicantId: 'u-006', clubId: 'club-002',
    rating: 4, comment: '编程基础扎实，沟通表达清晰，建议优先考虑。',
    concludedAt: daysFromNow(-2), authorName: '林晓峰', authorRole: 'club_leader', version: 1,
    history: [],
  },
]

export function findJointReviewExtra(jointId: string, applicantId: string, clubId: string): JointReviewExtra | undefined {
  return jointReviewExtras.find((e) => e.jointId === jointId && e.applicantId === applicantId && e.clubId === clubId)
}

export function upsertJointReviewExtra(jointId: string, applicantId: string, clubId: string, input: { rating: number; comment: string; authorName: string; authorRole: string }): JointReviewExtra {
  const existing = findJointReviewExtra(jointId, applicantId, clubId)
  if (existing) {
    // JNT-012：修改时保留旧值、新值、时间 → 写入 history
    existing.history = [
      ...(existing.history || []),
      { rating: existing.rating, comment: existing.comment, concludedAt: existing.concludedAt, version: existing.version, updatedAt: existing.concludedAt || new Date().toISOString() },
    ]
    existing.rating = input.rating
    existing.comment = input.comment
    existing.concludedAt = new Date().toISOString()
    existing.authorName = input.authorName
    existing.authorRole = input.authorRole
    existing.version += 1
    return existing
  }
  const extra: JointReviewExtra = {
    jointId, applicantId, clubId,
    rating: input.rating, comment: input.comment,
    concludedAt: new Date().toISOString(),
    authorName: input.authorName, authorRole: input.authorRole,
    version: 1,
    history: [],
  }
  jointReviewExtras.push(extra)
  return extra
}

export const jointSlots: { id: string; jointId: string; startAt: string; endAt: string; capacity: number; taken: number }[] = [
  { id: 'jslot-001', jointId: 'jnt-001', startAt: daysFromNow(2), endAt: plusHours(daysFromNow(2), 1), capacity: 20, taken: 1 },
  { id: 'jslot-002', jointId: 'jnt-001', startAt: daysFromNow(3), endAt: plusHours(daysFromNow(3), 1), capacity: 20, taken: 0 },
]

// ================= 工具 =================

export function findActivity(clubId: string, activityId: string): RecActivity | undefined {
  return recruitmentActivities.find((a) => a.id === activityId && a.clubId === clubId)
}
export function findAnyActivity(activityId: string): RecActivity | undefined {
  return recruitmentActivities.find((a) => a.id === activityId)
}
export function findJoint(jointId: string): JointActivity | undefined {
  return jointActivities.find((j) => j.id === jointId)
}
export function findJointApplication(jointId: string, applicantId: string): JointApplication | undefined {
  return jointApplications.find((a) => a.jointId === jointId && a.applicantId === applicantId)
}
export function findApplication(activityId: string, applicantId: string): RecApplication | undefined {
  return recruitmentApplications.find((a) => a.activityId === activityId && a.applicantId === applicantId)
}
export function findInvitation(invitationId: string): RecInvitation | undefined {
  return recruitmentInvitations.find((i) => i.id === invitationId)
}
export function findJointInvitation(invitationId: string): JointInvitation | undefined {
  return jointInvitations.find((i) => i.id === invitationId)
}

/** 时间区间重叠硬校验（跨普通招新/联合活动/社团） */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aEnd).getTime() > new Date(bStart).getTime() && new Date(bEnd).getTime() > new Date(aStart).getTime()
}

/** 面试官维度冲突检测：同一面试官在同一时段的普通招新面试任务重叠即冲突（排除已取消/已作废安排） */
export function interviewerTimeConflict(interviewerId: string, startAt: string, endAt: string, excludeId?: string): { conflict: boolean; detail?: string } {
  for (const it of recruitmentInterviews) {
    if (it.id === excludeId) continue
    if (!it.interviewerIds.includes(interviewerId)) continue
    if (['cancelled', 'invalidated'].includes(it.status)) continue
    if (it.startAt && it.endAt && overlaps(startAt, endAt, it.startAt, it.endAt)) {
      return { conflict: true, detail: `面试官 ${mockUsers[interviewerId]?.name || applicantNameOf(interviewerId) || interviewerId} 在该时段已有面试任务` }
    }
  }
  return { conflict: false }
}

/** 申请人全局冲突检测：跨活动跨社团，排除已取消/已作废/已释放安排；只提示冲突区间，不泄漏对端姓名 */
export function applicantTimeConflict(applicantId: string, startAt: string, endAt: string, excludeId?: string): { conflict: boolean; detail?: string } {
  const range = (s: string, e: string) => `（${s.slice(5, 16)} ~ ${e.slice(11, 16)}）`
  for (const it of recruitmentInterviews) {
    if (it.applicantId !== applicantId || it.id === excludeId) continue
    if (['cancelled', 'invalidated'].includes(it.status)) continue
    if (it.startAt && it.endAt && overlaps(startAt, endAt, it.startAt, it.endAt)) {
      return { conflict: true, detail: `与普通招新面试冲突${range(it.startAt, it.endAt)}` }
    }
  }
  for (const it of jointInterviews) {
    if (it.applicantId !== applicantId || it.id === excludeId) continue
    if (['invalidated', 'cancelled_archived'].includes(it.status)) continue
    if (it.startAt && it.endAt && overlaps(startAt, endAt, it.startAt, it.endAt)) {
      return { conflict: true, detail: `与联合面试冲突${range(it.startAt, it.endAt)}` }
    }
  }
  return { conflict: false }
}

// ================= REC 活动 =================

export function listActivities(clubId: string): RecActivity[] {
  return recruitmentActivities.filter((a) => a.clubId === clubId)
}

export function createActivity(
  clubId: string,
  clubName: string,
  input: { title: string; description?: string; deadline?: string; departments?: { id: string; name: string }[]; formId?: string },
): { ok: boolean; error?: string; data?: RecActivity } {
  const deadline = input.deadline || daysFromNow(30)
  const a: RecActivity = {
    id: 'act-' + Date.now(), clubId, clubName, title: input.title, description: input.description || '',
    status: 'draft', channelStatus: 'not_open', channelBeforePause: null, pauseStartAt: null,
    deadline, deadlineVersion: 1, window: { seq: 1, deadline },
    formId: input.formId || 'form-001', formVersion: 1,
    departments: input.departments?.length ? input.departments : [{ id: 'dept-001', name: '技术部' }],
    eligibility: { colleges: [], grades: [] },
    volunteerRules: { min: 1, max: 1 }, allowAdjustmentDefault: true,
    conclusionMode: 'club_unified', rounds: [], applicantIds: [], invitationIds: [], reviewIds: [],
    publishedAt: null, completedAt: null, cancelledAt: null, archivedAt: null,
    version: 1, createdAt: now(),
  }
  recruitmentActivities.unshift(a)
  return ok(a)
}

export function updateActivity(activityId: string, input: Partial<Pick<RecActivity, 'title' | 'description' | 'departments' | 'eligibility' | 'volunteerRules' | 'formId' | 'formVersion' | 'conclusionMode'>>): { ok: boolean; error?: string; data?: RecActivity } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status === 'draft' || a.status === 'in_progress' || a.status === 'paused') {
    Object.assign(a, input)
    a.version += 1
  }
  return ok(a)
}

/** 发布活动（SM-REC-001 draft→in_progress） */
export function publishActivity(activityId: string): { ok: boolean; error?: string; data?: RecActivity } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.departments.length === 0) return err('至少配置一个开放部门')
  if (a.volunteerRules.max < a.volunteerRules.min || a.volunteerRules.min < 1) return err('志愿数量规则无效')
  const t = assertTransition('SM-REC-001', a.status, 'in_progress', 'publish')
  if (!t.ok) return err(t.reason || '当前状态不可发布')
  a.status = 'in_progress'
  a.publishedAt = now()
  a.version += 1
  return ok(a)
}

export function pauseActivity(activityId: string, reason: string): { ok: boolean; error?: string } {
  if (!reason.trim()) return err('暂停活动必须填写原因')
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-001', a.status, 'paused', 'pause')
  if (!t.ok) return err(t.reason || '当前状态不可暂停')
  a.status = 'paused'
  a.pauseStartAt = now()
  a.channelBeforePause = a.channelStatus
  a.version += 1
  return ok()
}

export function resumeActivity(activityId: string): { ok: boolean; error?: string } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-001', a.status, 'in_progress', 'resume')
  if (!t.ok) return err(t.reason || '当前状态不可恢复')
  if (a.pauseStartAt) {
    const pausedMs = Date.now() - new Date(a.pauseStartAt).getTime()
    a.deadline = new Date(new Date(a.deadline).getTime() + pausedMs).toISOString()
  }
  a.status = 'in_progress'
  a.pauseStartAt = null
  a.channelStatus = a.channelBeforePause || a.channelStatus
  a.channelBeforePause = null
  a.version += 1
  return ok()
}

export function closeChannel(activityId: string, reason: string): { ok: boolean; error?: string } {
  if (!reason.trim()) return err('关闭通道必须填写原因')
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-002', a.channelStatus, 'closed', 'close')
  if (!t.ok) return err(t.reason || '当前通道状态不可关闭')
  a.channelStatus = 'closed'
  a.version += 1
  return ok()
}

export function reopenChannel(activityId: string, newDeadline: string): { ok: boolean; error?: string } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-002', a.channelStatus, 'open', 'reopen_with_deadline')
  if (!t.ok) return err(t.reason || '当前通道状态不可重开')
  if (new Date(newDeadline).getTime() <= Date.now()) return err('新截止必须严格晚于当前时刻')
  if (a.status !== 'in_progress') return err('仅进行中且未整体暂停的活动可重开报名')
  a.channelStatus = 'open'
  a.deadlineVersion += 1
  a.window = { seq: a.window.seq + 1, deadline: newDeadline }
  a.deadline = newDeadline
  a.version += 1
  return ok()
}

export function pauseChannel(activityId: string): { ok: boolean; error?: string } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-002', a.channelStatus, 'paused', 'pause')
  if (!t.ok) return err(t.reason || '当前通道状态不可暂停')
  a.channelStatus = 'paused'
  a.version += 1
  return ok()
}

export function resumeChannel(activityId: string, newDeadline: string): { ok: boolean; error?: string } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-002', a.channelStatus, 'open', 'resume_with_deadline')
  if (!t.ok) return err(t.reason || '当前通道状态不可恢复')
  if (new Date(newDeadline).getTime() <= Date.now()) return err('新截止必须严格晚于当前时刻')
  a.channelStatus = 'open'
  a.deadlineVersion += 1
  a.window = { seq: a.window.seq + 1, deadline: newDeadline }
  a.deadline = newDeadline
  a.version += 1
  return ok()
}

/** REC-007/044：收紧规则前暂停通道，为已提交申请人开放补救窗口 */
export function tightenRecruitmentRules(activityId: string, reason: string, deadlineDays: number): { ok: boolean; error?: string; data?: { affected: { applicantId: string; applicantName: string; adjustmentDeadline: string }[] } } {
  if (!reason.trim()) return err('收紧规则必须填写原因')
  if (!Number.isInteger(deadlineDays) || deadlineDays < 1 || deadlineDays > 30) return err('补救窗口天数须在 1~30 之间')
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status !== 'in_progress') return err('活动当前不可操作')
  const p = assertTransition('SM-REC-002', a.channelStatus, 'paused', 'pause')
  if (!p.ok) return err(p.reason || '当前通道状态不可暂停')
  a.channelStatus = 'paused'
  const deadline = new Date(Date.now() + deadlineDays * 24 * 3600 * 1000).toISOString()
  const affected: { applicantId: string; applicantName: string; adjustmentDeadline: string }[] = []
  for (const appId of a.applicantIds) {
    const app = recruitmentApplications.find((x) => x.id === appId)
    if (!app || app.status !== 'submitted') continue
    const t = assertTransition('SM-REC-003', app.status, 'submitted', 'rule_tightening')
    if (!t.ok) return err(`申请人 ${app.applicantName} 当前状态不可标记补救`)
    app.adjustmentDeadline = deadline
    app.adjustmentReason = reason
    app.version += 1
    affected.push({ applicantId: app.applicantId, applicantName: app.applicantName, adjustmentDeadline: deadline })
  }
  a.version += 1
  return ok({ affected })
}

/** REC-044：补救窗口到期惰性推进 submitted → adjustment_overdue，不自动淘汰 */
export function applyAdjustmentTimeouts(activityId: string): void {
  const a = findAnyActivity(activityId)
  if (!a) return
  const nowMs = Date.now()
  for (const appId of a.applicantIds) {
    const app = recruitmentApplications.find((x) => x.id === appId)
    if (!app || app.status !== 'submitted' || !app.adjustmentDeadline) continue
    if (new Date(app.adjustmentDeadline).getTime() >= nowMs) continue
    const t = assertTransition('SM-REC-003', app.status, 'adjustment_overdue', 'timeout')
    if (!t.ok) continue
    app.status = 'adjustment_overdue'
    app.version += 1
  }
}

/** REC-044：处理调整逾期——延长窗口（回到 submitted）或资格不符结论（须填原因） */
export function resolveAdjustment(activityId: string, applicantId: string, action: 'extend' | 'not_qualified', reason: string, newDeadline?: string): { ok: boolean; error?: string; data?: RecApplication } {
  if (!reason.trim()) return err('必须填写处理原因')
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  if (app.status !== 'adjustment_overdue' && !app.adjustmentDeadline) return err('该申请当前无补救窗口')
  if (action === 'extend') {
    let deadline = newDeadline
    if (!deadline) deadline = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    if (new Date(deadline).getTime() <= Date.now()) return err('延长后的截止必须严格晚于当前时刻')
    const t = assertTransition('SM-REC-003', app.status, 'submitted', 'extend_window')
    if (!t.ok) return err(t.reason || '当前申请状态不可延长窗口')
    app.status = 'submitted'
    app.adjustmentDeadline = deadline
    app.adjustmentReason = reason
    app.version += 1
    return ok(app)
  }
  const t = assertTransition('SM-REC-003', app.status, 'not_qualified', 'not_qualified')
  if (!t.ok) return err(t.reason || '当前申请状态不可作出资格不符结论')
  app.status = 'not_qualified'
  app.notQualifiedReason = reason
  app.adjustmentDeadline = null
  app.adjustmentReason = null
  app.version += 1
  return ok(app)
}

/** 正常完成：所有路径终态+结果发布+邀请全终态+无未完成成员同步 */
export function completeActivity(activityId: string): { ok: boolean; error?: string } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-001', a.status, 'completed', 'complete')
  if (!t.ok) return err(t.reason || '当前状态不可完成')
  if (a.channelStatus !== 'closed') return err('报名通道尚未关闭，无法正常完成')
  for (const appId of a.applicantIds) {
    const app = recruitmentApplications.find((x) => x.id === appId)
    if (!app) continue
    if (['submitted', 'revision_requested', 'adjustment_overdue', 'identity_anomaly'].includes(app.status)) return err('仍有未终结的申请路径，无法正常完成')
  }
  const pendingInv = recruitmentInvitations.some((i) => a.invitationIds.includes(i.id) && i.status === 'pending_acceptance')
  if (pendingInv) return err('仍有待处理的录取邀请，无法正常完成')
  a.status = 'completed'
  a.completedAt = now()
  a.version += 1
  expireActivityTasks(activityId)
  return ok()
}

export function cancelActivity(activityId: string, reason: string, confirmAcceptedSync: boolean): { ok: boolean; error?: string } {
  if (!reason.trim()) return err('取消活动必须填写原因')
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-001', a.status, 'cancelled', 'cancel')
  if (!t.ok) return err(t.reason || '当前状态不可取消')
  const hasAcceptedSync = recruitmentInvitations.some((i) => a.invitationIds.includes(i.id) && i.status === 'accepted' && i.casdoorSync === 'processing')
  if (hasAcceptedSync && !confirmAcceptedSync) return err('存在已接受且成员同步处理中的邀请，请二次确认后取消')
  a.status = 'cancelled'
  a.cancelledAt = now()
  a.channelStatus = 'closed'
  for (const it of recruitmentInterviews) {
    if (it.activityId === a.id && ['pending_selection', 'scheduled', 'leave', 'late', 'absent'].includes(it.status)) {
      it.status = 'cancelled'
      it.cancelReason = '活动取消'
      // 仅当面试仍持有 slot 引用时释放容量，并同步清空引用（与 markAttendance 约定一致）
      if (it.slotId) {
        const slot = a.rounds.flatMap((r) => r.slots).find((s) => s.id === it.slotId)
        if (slot) slot.taken = Math.max(0, slot.taken - 1)
        it.slotId = null
        it.startAt = null
        it.endAt = null
      }
    }
  }
  expireActivityTasks(activityId)
  for (const inv of recruitmentInvitations) {
    if (a.invitationIds.includes(inv.id) && inv.status === 'pending_acceptance') {
      inv.status = 'expired'
      inv.casdoorSync = 'none'
    }
  }
  a.version += 1
  return ok()
}

export function forceCompleteActivity(activityId: string, reason: string): { ok: boolean; error?: string } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const t = assertTransition('SM-REC-001', a.status, 'force_completed', 'force_complete')
  if (!t.ok) return err(t.reason || '当前状态不可强制完成')
  if (!reason.trim()) return err('必须填写强制完成原因')
  a.status = 'force_completed'
  a.completedAt = now()
  a.channelStatus = 'closed'
  for (const it of recruitmentInterviews) {
    if (it.activityId === a.id && ['pending_selection', 'scheduled', 'leave', 'late', 'absent'].includes(it.status)) {
      it.status = 'cancelled'
      it.cancelReason = '活动强制完成'
      // 仅当面试仍持有 slot 引用时释放容量，并同步清空引用（与 markAttendance 约定一致）
      if (it.slotId) {
        const slot = a.rounds.flatMap((r) => r.slots).find((s) => s.id === it.slotId)
        if (slot) slot.taken = Math.max(0, slot.taken - 1)
        it.slotId = null
        it.startAt = null
        it.endAt = null
      }
    }
  }
  for (const inv of recruitmentInvitations) {
    if (a.invitationIds.includes(inv.id) && inv.status === 'pending_acceptance') {
      inv.status = 'expired'
    }
  }
  expireActivityTasks(activityId)
  a.version += 1
  return ok()
}

// ================= REC 轮次与面试 =================

export function createRound(activityId: string, input: { name: string; mode: 'club_unified' | 'dept_separate'; selectDeadline: string; slots: { startAt: string; endAt: string; capacity: number }[] }): { ok: boolean; error?: string; data?: RecRound } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'force_completed' || a.status === 'archived') return err('活动已终结，不可新增轮次')
  const round: RecRound = {
    id: 'rd-' + Date.now(), name: input.name, status: 'open', mode: input.mode,
    selectDeadline: input.selectDeadline,
    slots: input.slots.map((s) => ({ id: 'slot-' + Date.now() + Math.random().toString(36).slice(2, 6), roundId: '', startAt: s.startAt, endAt: s.endAt, capacity: s.capacity, taken: 0 })),
  }
  round.slots.forEach((s) => (s.roundId = round.id))
  a.rounds.push(round)
  a.version += 1
  return ok(round)
}

export function updateRound(activityId: string, roundId: string, input: { name?: string; selectDeadline?: string }): { ok: boolean; error?: string; data?: RecRound } {
  const a = findAnyActivity(activityId)
  const round = a?.rounds.find((r) => r.id === roundId)
  if (!round) return err('轮次不存在')
  const hasScheduled = recruitmentInterviews.some((i) => i.roundId === roundId && i.status !== 'cancelled' && i.status !== 'invalidated')
  if (hasScheduled && (input.name || input.selectDeadline)) {
    return err('已有申请人排期的轮次不可修改，只能取消轮次')
  }
  if (input.name) round.name = input.name
  if (input.selectDeadline) round.selectDeadline = input.selectDeadline
  return ok(round)
}

export function cancelRound(activityId: string, roundId: string, reason: string): { ok: boolean; error?: string } {
  const a = findAnyActivity(activityId)
  const round = a?.rounds.find((r) => r.id === roundId)
  if (!round) return err('轮次不存在')
  if (!reason.trim()) return err('取消轮次必须填写原因')
  if (round.status === 'cancelled') return err('轮次已取消，请勿重复操作')
  round.status = 'cancelled'
  for (const it of recruitmentInterviews) {
    if (it.roundId === roundId && ['pending_selection', 'scheduled', 'leave', 'late', 'absent'].includes(it.status)) {
      it.status = 'cancelled'
      it.cancelReason = '轮次取消'
      const slot = round.slots.find((s) => s.id === it.slotId)
      if (slot) slot.taken = Math.max(0, slot.taken - 1)
    }
  }
  expireRoundTasks(activityId, roundId)
  a!.version += 1
  return ok()
}

/** 预约/改期面试：申请人本人或管理员；原子释放旧时段+占用新时段；全局冲突校验 */
export function bookInterview(activityId: string, applicantId: string, roundId: string, slotId: string, actorId: string, actorIsAdmin: boolean, interviewerIds?: string[]): { ok: boolean; error?: string; data?: RecInterview } {
  void actorId
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const round = a.rounds.find((r) => r.id === roundId)
  if (!round || round.status !== 'open') return err('轮次不存在或已关闭')
  if (round.selectDeadline && new Date(round.selectDeadline).getTime() < Date.now() && !actorIsAdmin) return err('选时已截止')
  const slot = round.slots.find((s) => s.id === slotId)
  if (!slot) return err('时间段不存在')
  if (slot.taken >= slot.capacity) return err('该时段已满员')
  let existing = recruitmentInterviews.find((i) => i.activityId === activityId && i.applicantId === applicantId && i.roundId === roundId && i.status !== 'cancelled' && i.status !== 'invalidated')
  if (existing) {
    const event = existing.status === 'scheduled' ? 'reschedule'
      : ['leave', 'late', 'absent', 'invalidated'].includes(existing.status) ? 'rearrange'
      : 'select'
    const t = assertTransition('SM-REC-005', existing.status, 'scheduled', event)
    if (!t.ok) return err(t.reason || '当前面试记录不可改期')
  }
  const conflict = applicantTimeConflict(applicantId, slot.startAt, slot.endAt, existing?.id)
  if (conflict.conflict) return err(conflict.detail || '该时段与既有安排冲突')
  for (const interviewerId of interviewerIds || []) {
    const ic = interviewerTimeConflict(interviewerId, slot.startAt, slot.endAt, existing?.id)
    if (ic.conflict) return err(ic.detail || '面试官在该时段已有任务')
  }
  if (existing) {
    const oldSlot = round.slots.find((s) => s.id === existing!.slotId)
    if (oldSlot && oldSlot.id !== slotId) oldSlot.taken = Math.max(0, oldSlot.taken - 1)
    existing.slotId = slotId
    existing.startAt = slot.startAt
    existing.endAt = slot.endAt
    if (interviewerIds) existing.interviewerIds = interviewerIds
    existing.status = 'scheduled'
    existing.attendance = 'none'
    existing.version += 1
  } else {
    existing = {
      id: 'int-' + Date.now(), activityId, clubId: a.clubId, applicantId, applicantName: applicantNameOf(applicantId),
      roundId, status: 'scheduled', slotId, startAt: slot.startAt, endAt: slot.endAt,
      actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, skipReason: null, cancelReason: null,
      interviewerIds: interviewerIds || [],
      version: 1,
    }
    recruitmentInterviews.push(existing)
  }
  slot.taken += 1
  return ok(existing)
}

export function markAttendance(interviewId: string, event: 'leave' | 'late' | 'absent', actorIsAdmin: boolean): { ok: boolean; error?: string; data?: RecInterview } {
  void actorIsAdmin
  const it = recruitmentInterviews.find((i) => i.id === interviewId)
  if (!it) return err('面试记录不存在')
  const t = assertTransition('SM-REC-005', it.status, event, event)
  if (!t.ok) return err(t.reason || '当前状态不可标记出勤')
  it.status = event
  it.attendance = event
  const a = findAnyActivity(it.activityId)
  const slot = a?.rounds.flatMap((r) => r.slots).find((s) => s.id === it.slotId)
  if (slot) slot.taken = Math.max(0, slot.taken - 1)
  it.slotId = null
  it.startAt = null
  it.endAt = null
  it.version += 1
  return ok(it)
}

export function startInterview(interviewId: string): { ok: boolean; error?: string; data?: RecInterview } {
  const it = recruitmentInterviews.find((i) => i.id === interviewId)
  if (!it) return err('面试记录不存在')
  const t = assertTransition('SM-REC-005', it.status, 'in_progress', 'start')
  if (!t.ok) return err(t.reason || '当前状态不可开始')
  it.status = 'in_progress'
  it.actualStartAt = now()
  it.version += 1
  return ok(it)
}

export function completeInterview(interviewId: string): { ok: boolean; error?: string; data?: RecInterview } {
  const it = recruitmentInterviews.find((i) => i.id === interviewId)
  if (!it) return err('面试记录不存在')
  const t = assertTransition('SM-REC-005', it.status, 'completed', 'complete')
  if (!t.ok) return err(t.reason || '当前状态不可完成')
  it.status = 'completed'
  it.actualEndAt = now()
  it.attendance = 'present'
  it.version += 1
  return ok(it)
}

export function invalidateInterview(interviewId: string, reason: string): { ok: boolean; error?: string; data?: RecInterview } {
  const it = recruitmentInterviews.find((i) => i.id === interviewId)
  if (!it) return err('面试记录不存在')
  const t = assertTransition('SM-REC-005', it.status, 'invalidated', 'invalidate')
  if (!t.ok) return err(t.reason || '当前状态不可作废')
  if (!reason.trim()) return err('作废必须填写原因')
  if (it.actualStartAt) return err('主观不同意评分不能作为作废理由；记录已开始需谨慎确认')
  it.status = 'invalidated'
  it.invalidReason = reason
  // 仅当面试仍持有 slot 引用时释放容量，并同步清空引用
  if (it.slotId) {
    const a = findAnyActivity(it.activityId)
    const slot = a?.rounds.flatMap((r) => r.slots).find((s) => s.id === it.slotId)
    if (slot) slot.taken = Math.max(0, slot.taken - 1)
    it.slotId = null
    it.startAt = null
    it.endAt = null
  }
  it.version += 1
  return ok(it)
}

export function skipRoundInterview(activityId: string, applicantId: string, roundId: string, reason: string): { ok: boolean; error?: string } {
  const it = recruitmentInterviews.find((i) => i.activityId === activityId && i.applicantId === applicantId && i.roundId === roundId)
  if (it && it.status !== 'pending_selection' && it.status !== 'scheduled') return err('该申请人本轮的面试已开始或完成')
  if (!reason.trim()) return err('跳轮/免试必须填写原因')
  if (it) {
    const t = assertTransition('SM-REC-005', it.status, 'cancelled', 'skip_round')
    if (!t.ok) return err(t.reason || '当前状态不可跳轮')
    it.status = 'cancelled'
    it.skipReason = reason
    const a = findAnyActivity(activityId)
    const slot = a?.rounds.flatMap((r) => r.slots).find((s) => s.id === it.slotId)
    if (slot) slot.taken = Math.max(0, slot.taken - 1)
  } else {
    recruitmentInterviews.push({
      id: 'int-' + Date.now(), activityId, clubId: findAnyActivity(activityId)?.clubId || '', applicantId, applicantName: applicantNameOf(applicantId),
      roundId, status: 'cancelled', slotId: null, startAt: null, endAt: null,
      actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null,
      skipReason: reason, cancelReason: null, interviewerIds: [], version: 1,
    })
  }
  return ok()
}

// ================= REC 申请 =================

export function saveApplicationDraft(activityId: string, applicantId: string, input: { answers?: Record<string, unknown>; expectedVersion?: number }): { ok: boolean; error?: string; data?: RecApplication } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  let app = findApplication(activityId, applicantId)
  if (!app) {
    app = {
      id: 'app-' + Date.now(), activityId, clubId: a.clubId, applicantId, applicantName: applicantNameOf(applicantId), studentId: applicantStudentIdOf(applicantId),
      status: 'draft', preferences: [], allowAdjustment: a.allowAdjustmentDefault, formVersion: a.formVersion,
      answers: input.answers || {}, paths: {}, submittedAt: null, withdrawnAt: null,
      recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, eligibilitySnapshot: null, version: 1,
    }
    if (!a.applicantIds.includes(app.id)) a.applicantIds.push(app.id)
    recruitmentApplications.push(app)
  } else if (app.status === 'submitted') {
    return err('申请已提交，请通过撤销提交回到草稿')
  } else if (app.status === 'identity_anomaly') {
    return err('账号身份异常，不能保存或修改报名')
  }
  // P2-8 乐观锁：已有草稿时比对 expectedVersion，防止多标签页/并发覆盖
  if (input.expectedVersion !== undefined && app.version !== input.expectedVersion) {
    return err('数据版本已变化，请刷新后重试')
  }
  app.answers = { ...app.answers, ...(input.answers || {}) }
  app.version += 1
  return ok(app)
}

/**
 * 撤销报名提交的预判原因（只读，不执行变更）：与 withdrawApplicationSubmission 同源校验，
 * 供「我的申请」详情返回 withdrawBlockedReason，前端据此禁用撤销按钮并内联展示原因。
 */
export function withdrawApplicationBlockedReason(activityId: string, applicantId: string): string | null {
  const a = findAnyActivity(activityId)
  if (!a) return '活动不存在'
  if (a.status !== 'in_progress') return '活动当前不在报名期，无法撤销提交'
  if (a.channelStatus !== 'open') return '报名通道已关闭，无法撤销提交'
  if (new Date(a.deadline).getTime() < Date.now()) return '报名已截止，无法撤销提交'
  const app = findApplication(activityId, applicantId)
  if (!app) return '申请不存在'
  const t = assertTransition('SM-REC-003', app.status, 'draft', 'withdraw_submission')
  if (!t.ok) return t.reason || '仅已提交的申请可撤销'
  // 同一活动+申请人可跨多轮存多条面试记录，须全量校验：任一非 pending_selection/cancelled 即视为已排期/已产生结果
  const committedInterview = recruitmentInterviews.some(
    (i) => i.activityId === activityId && i.applicantId === applicantId && i.status !== 'pending_selection' && i.status !== 'cancelled',
  )
  if (committedInterview) return '已安排面试，无法撤销提交'
  const activePath = Object.values(app.paths).find((p) => p.status !== 'evaluating')
  if (activePath) return '已有审核结论，无法撤销提交'
  return null
}

/**
 * 撤销报名提交（普通招新专用，与联合版 withdrawJointApplication 同规范）：
 * 仅通道开放且未截止时可撤销；已有排期/进行中/已完结面试（多轮面试全量校验）或形成审核结论时拒绝；
 * 撤销时清理全部轮次的未排期面试记录、作废待处理录取邀请、清空未形成结论的部门路径，
 * 回到草稿可修改后重新提交。
 */
export function withdrawApplicationSubmission(activityId: string, applicantId: string): { ok: boolean; error?: string; data?: RecApplication } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status !== 'in_progress') return err('活动当前不在报名期，无法撤销提交')
  if (a.channelStatus !== 'open') return err('报名通道已关闭，无法撤销提交')
  if (new Date(a.deadline).getTime() < Date.now()) return err('报名已截止，无法撤销提交')
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const t = assertTransition('SM-REC-003', app.status, 'draft', 'withdraw_submission')
  if (!t.ok) return err(t.reason || '仅已提交的申请可撤销')
  // 同一活动+申请人可跨多轮存多条面试记录，须全量校验：任一非 pending_selection/cancelled 即视为已排期/已产生结果
  const committedInterview = recruitmentInterviews.some(
    (i) => i.activityId === activityId && i.applicantId === applicantId && i.status !== 'pending_selection' && i.status !== 'cancelled',
  )
  if (committedInterview) return err('已安排面试，无法撤销提交')
  const activePath = Object.values(app.paths).find((p) => p.status !== 'evaluating')
  if (activePath) return err('已有审核结论，无法撤销提交')
  for (let i = recruitmentInterviews.length - 1; i >= 0; i--) {
    const it = recruitmentInterviews[i]
    if (it.activityId === activityId && it.applicantId === applicantId && it.status === 'pending_selection') recruitmentInterviews.splice(i, 1)
  }
  for (const inv of recruitmentInvitations) {
    if (inv.activityId === activityId && inv.applicantId === applicantId && inv.status === 'pending_acceptance') {
      inv.status = 'expired'
    }
  }
  app.paths = {}
  app.status = 'draft'
  app.submittedAt = null
  app.withdrawnAt = null
  // 撤销提交回到草稿：资格快照须同步清空，避免草稿态残留已失效的「提交时快照」
  app.eligibilitySnapshot = null
  app.version += 1
  return ok(app)
}

export function submitApplication(activityId: string, applicantId: string, input: { preferences: { departmentId: string }[]; allowAdjustment: boolean; answers?: Record<string, unknown> }): { ok: boolean; error?: string; data?: RecApplication } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status !== 'in_progress') return err('活动当前不可报名')
  const existing = findApplication(activityId, applicantId)
  const inAdjustment = !!existing?.adjustmentDeadline && new Date(existing.adjustmentDeadline).getTime() >= Date.now()
  // 已提交（非补救窗口内）优先引导撤销；窗口内用户与 rule_tightening 路径条件互斥，不在此拦截
  if (existing && existing.status === 'submitted' && !inAdjustment) return err('申请已提交，请通过撤销提交回到草稿')
  if (a.channelStatus !== 'open' && !inAdjustment) return err('报名通道当前未开放')
  if (a.channelStatus !== 'open' && existing?.status === 'adjustment_overdue') return err('调整逾期，请联系管理员延长窗口或处理')
  if (a.channelStatus === 'open' && new Date(a.deadline).getTime() < Date.now()) return err('报名已截止')
  const dup = input.preferences.map((p) => p.departmentId)
  if (new Set(dup).size !== dup.length) return err('志愿部门不能重复')
  if (dup.length < a.volunteerRules.min || dup.length > a.volunteerRules.max) return err(`志愿数量须在 ${a.volunteerRules.min}~${a.volunteerRules.max} 之间`)
  for (const p of input.preferences) {
    if (!a.departments.some((d) => d.id === p.departmentId)) return err('志愿必须来自本批次开放的部门')
  }
  let app = findApplication(activityId, applicantId)
  if (app && app.status === 'accepted') return err('该申请已接受录取，不能再次提交')
  if (app && app.status === 'identity_anomaly') return err('账号身份异常，不能提交')
  if (app && app.status === 'exited') {
    if (!app.recoveryWindowDeadline) return err('已退出招新，请先创建恢复窗口')
    if (new Date(app.recoveryWindowDeadline).getTime() < Date.now()) return err('恢复窗口已过期')
  }
  if (!app) {
    app = {
      id: 'app-' + Date.now(), activityId, clubId: a.clubId, applicantId, applicantName: applicantNameOf(applicantId), studentId: applicantStudentIdOf(applicantId),
      status: 'draft', preferences: [], allowAdjustment: input.allowAdjustment ?? a.allowAdjustmentDefault, formVersion: a.formVersion,
      answers: input.answers || {}, paths: {}, submittedAt: null, withdrawnAt: null,
      recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, eligibilitySnapshot: null, version: 1,
    }
    recruitmentApplications.push(app)
    a.applicantIds.push(app.id)
  }
  let okResult: { ok: boolean; reason?: string }
  if (app.status === 'exited') {
    okResult = assertTransition('SM-REC-003', 'exited', 'submitted', 'recovery_resubmit')
  } else if (app.status === 'revision_requested') {
    okResult = assertTransition('SM-REC-003', 'revision_requested', 'submitted', 'submit_in_window')
  } else if (inAdjustment && app.status === 'submitted') {
    okResult = assertTransition('SM-REC-003', 'submitted', 'submitted', 'rule_tightening')
  } else {
    okResult = assertTransition('SM-REC-003', app.status, 'submitted', 'submit')
  }
  if (!okResult.ok) return err(okResult.reason || '当前申请状态不可提交')
  app.status = 'submitted'
  app.preferences = input.preferences.map((p, i) => {
    const d = a.departments.find((x) => x.id === p.departmentId)!
    return { order: i + 1, departmentId: d.id, departmentName: d.name }
  })
  app.allowAdjustment = input.allowAdjustment ?? a.allowAdjustmentDefault
  app.answers = { ...(input.answers || {}) }
  app.formVersion = a.formVersion
  app.submittedAt = now()
  app.withdrawnAt = null
  app.recoveryWindowDeadline = null
  app.adjustmentDeadline = null
  app.adjustmentReason = null
  app.notQualifiedReason = null
  app.version += 1
  // 保存资格快照（REC-035：提交时固化，审计/回放使用；深拷贝防后续变更污染）
  // 注意：使用 structuredClone 而非浅展开——answers 可能含嵌套对象/数组，浅拷贝会共享引用
  app.eligibilitySnapshot = {
    answers: structuredClone(input.answers || {}),
    preferences: structuredClone(app.preferences),
    submittedAt: app.submittedAt!,
    formVersion: a.formVersion,
  }
  for (const p of app.preferences) {
    if (!app.paths[p.departmentId]) {
      app.paths[p.departmentId] = { departmentId: p.departmentId, departmentName: p.departmentName, order: p.order, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, labelSetByUserId: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 }
    }
  }
  return ok(app)
}

export function withdrawApplication(activityId: string, applicantId: string, confirm: boolean): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  if (app.status === 'accepted') return err('已接受录取邀请，不能退出招新；请走成员退出流程')
  const t = assertTransition('SM-REC-003', app.status, 'exited', 'withdraw')
  if (!t.ok) return err(t.reason || '当前申请不可退出')
  if (!confirm) return err('请二次确认退出招新')
  app.status = 'exited'
  app.withdrawnAt = now()
  const a = findAnyActivity(activityId)
  for (const it of recruitmentInterviews) {
    if (it.applicantId === applicantId && it.activityId === activityId && ['pending_selection', 'scheduled', 'leave', 'late', 'absent'].includes(it.status)) {
      it.status = 'cancelled'
      it.cancelReason = '申请人退出招新'
      // 仅当面试仍持有 slot 引用时释放容量，并同步清空引用
      if (it.slotId) {
        const slot = a?.rounds.flatMap((r) => r.slots).find((s) => s.id === it.slotId)
        if (slot) slot.taken = Math.max(0, slot.taken - 1)
        it.slotId = null
        it.startAt = null
        it.endAt = null
      }
    }
  }
  for (const inv of recruitmentInvitations) {
    if (inv.applicantId === applicantId && inv.activityId === activityId && inv.status === 'pending_acceptance') {
      inv.status = 'expired'
    }
  }
  app.version += 1
  return ok()
}

export function createRecoveryWindow(activityId: string, applicantId: string, deadline: string): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  if (app.status !== 'exited') return err('仅已退出的申请可创建恢复窗口')
  if (app.recoveryWindowDeadline) return err('该申请已有一个有效恢复窗口')
  if (new Date(deadline).getTime() <= Date.now()) return err('窗口截止必须严格晚于当前时刻')
  app.recoveryWindowDeadline = deadline
  app.version += 1
  return ok()
}

export function requestSupplement(activityId: string, applicantId: string, requirement: string, deadline: string): { ok: boolean; error?: string } {
  if (!requirement.trim()) return err('必须填写补充要求')
  if (new Date(deadline).getTime() <= Date.now()) return err('补充截止必须严格晚于当前时刻')
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const t = assertTransition('SM-REC-003', app.status, 'revision_requested', 'request_supplement')
  if (!t.ok) return err(t.reason || '当前申请不可发起补充请求')
  app.status = 'revision_requested'
  app.version += 1
  return ok()
}

export function markIdentityAnomaly(activityId: string, applicantId: string): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const t = assertTransition('SM-REC-003', app.status, 'identity_anomaly', 'identity_disabled')
  if (!t.ok) return err(t.reason || '当前申请不可标记身份异常')
  app.status = 'identity_anomaly'
  app.identityAnomalyAt = now()
  app.version += 1
  return ok()
}

export function recoverIdentityAnomaly(activityId: string, applicantId: string): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const t = assertTransition('SM-REC-003', app.status, 'submitted', 'recovered')
  if (!t.ok) return err(t.reason || '当前申请不可恢复')
  app.status = 'submitted'
  app.identityAnomalyAt = null
  app.version += 1
  return ok()
}

export function publishNotQualified(activityId: string, applicantId: string, reason: string): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const t = assertTransition('SM-REC-003', app.status, 'not_qualified', 'publish_not_qualified')
  if (!t.ok) return err(t.reason || '当前申请不可发布资格失效结论')
  if (!reason.trim()) return err('必须填写结论原因')
  app.status = 'not_qualified'
  const a = findAnyActivity(activityId)
  for (const it of recruitmentInterviews) {
    if (it.applicantId === applicantId && it.activityId === activityId && ['pending_selection', 'scheduled'].includes(it.status)) {
      it.status = 'cancelled'
      it.cancelReason = '资格失效'
      // 仅当面试仍持有 slot 引用时释放容量，并同步清空引用
      if (it.slotId) {
        const slot = a?.rounds.flatMap((r) => r.slots).find((s) => s.id === it.slotId)
        if (slot) slot.taken = Math.max(0, slot.taken - 1)
        it.slotId = null
        it.startAt = null
        it.endAt = null
      }
    }
  }
  app.version += 1
  return ok()
}

// ================= REC 评价/路径/结论 =================

export function setDeptLabel(activityId: string, applicantId: string, departmentId: string, label: boolean, actorId: string, actorName: string, actorRole: string, isDeptLeader: boolean, actorUserId?: string | null): { ok: boolean; error?: string; data?: { override: boolean; prevLabelBy: string | null; prevLabelByUserId: string | null; prevUserId: string | null } } {
  void actorRole
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const path = app.paths[departmentId]
  if (!path) return err('该申请没有此部门路径')
  if (isDeptLeader && path.source !== 'volunteer') return err('部门负责人仅能操作正式报名本部门的申请人')
  const vol = app.preferences.find((p) => p.departmentId === departmentId)
  if (isDeptLeader && !vol) return err('部门负责人仅能为正式报名本部门的申请人设置标签')
  if (isDeptLeader && actorUserId && actorUserId === app.applicantId) return err('不能设置自己的标签')
  // 记录标签历史（REC-039）
  if (!path.labelHistory) path.labelHistory = []
  // 检测是否为改判：设置标签且已有其他设置者
  const override = !!label && !!path.labelSetBy && path.labelSetBy !== actorName
  // 原设置者直接取已固化的 userId（REC-039 存 labelSetByUserId），避免按姓名反查同名歧义
  const prevLabelBy = path.labelSetBy
  const prevLabelByUserId = path.labelSetByUserId
  const prevUserId = prevLabelByUserId
  if (label) {
    const t = assertTransition('SM-REC-004', path.status, 'decided', 'set_label')
    if (!t.ok) return err(t.reason || '当前路径不可设置标签')
    path.status = 'decided'
    path.decided = 'admit'
    path.labelSetBy = actorName
    // 显式固化设置者 userId（可与姓名一致地用于后续改判通知；无则回退 null，不再按姓名猜测）
    path.labelSetByUserId = actorUserId ?? null
    path.labelHistory.push({ actorName, actorId, action: override ? 'override' : 'set', timestamp: now() })
  } else {
    const toStatus = path.waitlist ? 'waitlist' : 'evaluating'
    const t = assertTransition('SM-REC-004', path.status, toStatus, 'clear_label')
    if (!t.ok) return err(t.reason || '当前路径不可清除标签')
    path.decided = null
    path.labelSetBy = null
    path.labelSetByUserId = null
    path.labelHistory.push({ actorName, actorId, action: 'clear', timestamp: now() })
    if (path.waitlist) path.status = 'waitlist'
    else path.status = 'evaluating'
  }
  path.version += 1
  app.version += 1
  return ok({ override, prevLabelBy, prevLabelByUserId, prevUserId })
}

/** 调剂路径创建（REC-036：管理员为申请人添加 source='adjustment' 的部门路径） */
export function addAdjustmentPath(activityId: string, applicantId: string, departmentId: string, departmentName: string, reason: string): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  // 仅「已提交」的申请可被调剂（草稿/已退出/资格失效/已录取等均不可）
  if (app.status !== 'submitted') return err('仅已提交的申请可创建调剂路径')
  if (app.paths[departmentId]) return err('该部门路径已存在')
  if (!a.departments.some((d) => d.id === departmentId)) return err('部门不在本次招新范围内')
  if (!reason.trim()) return err('必须填写调剂原因')
  const maxOrder = Math.max(0, ...Object.values(app.paths).map((p) => p.order))
  app.paths[departmentId] = {
    departmentId, departmentName, order: maxOrder + 1, source: 'adjustment',
    status: 'evaluating', decided: null, labelSetBy: null, labelSetByUserId: null, waitlist: false,
    holdDeadline: null, publishedAt: null, labelHistory: [], version: 1,
  }
  app.version += 1
  return ok()
}

export function decidePath(activityId: string, applicantId: string, departmentId: string, decision: 'admit' | 'not_admit' | 'hold', holdDeadline?: string): { ok: boolean; error?: string; overallNotAdmitted?: boolean } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const path = app.paths[departmentId]
  if (!path) return err('路径不存在')
  if (decision === 'hold') {
    if (!holdDeadline) return err('暂缓必须设置处理期限')
    const t = assertTransition('SM-REC-004', path.status, 'hold', 'hold')
    if (!t.ok) return err(t.reason || '当前路径不可暂缓')
    path.status = 'hold'
    path.holdDeadline = holdDeadline
  } else if (decision === 'admit') {
    const toStatus = path.status === 'waitlist' ? 'published' : 'decided'
    const event = path.status === 'waitlist' ? 'promote_invite' : 'decide'
    const t = assertTransition('SM-REC-004', path.status, toStatus, event)
    if (!t.ok) return err(t.reason || '当前路径不可作出录取决定')
    if (path.status === 'waitlist') path.status = 'published'
    else path.status = 'decided'
    path.decided = 'admit'
  } else {
    const t = assertTransition('SM-REC-004', path.status, 'published', 'publish')
    if (!t.ok) return err(t.reason || '当前路径不可发布拒绝结论')
    path.decided = 'not_admit'
    path.status = 'published'
    path.publishedAt = now()
  }
  path.version += 1
  app.version += 1
  // 检测整体未录取（所有有结论的路径均为 not_admit，且无待定/暂缓/候补/录取）
  const allPaths = Object.values(app.paths)
  const hasNotAdmit = allPaths.some((p) => p.decided === 'not_admit')
  if (hasNotAdmit) {
    const allDecidedNotAdmit = allPaths.every((p) => p.decided === 'not_admit' || p.decided === null)
    const hasAnyAdmitOrPending = allPaths.some((p) => p.decided === 'admit' || p.status === 'evaluating' || p.status === 'hold' || p.status === 'pending' || p.status === 'waitlist')
    return { ok: true, overallNotAdmitted: allDecidedNotAdmit && hasNotAdmit && !hasAnyAdmitOrPending }
  }
  return ok()
}

export function setWaitlist(activityId: string, applicantId: string, departmentId: string, on: boolean): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const path = app.paths[departmentId]
  if (!path) return err('路径不存在')
  if (on) {
    const t = assertTransition('SM-REC-004', path.status, 'waitlist', 'waitlist')
    if (!t.ok) return err(t.reason || '当前路径不可设为候补')
    path.status = 'waitlist'
    path.waitlist = true
  } else {
    const toStatus = path.decided === 'admit' ? 'decided' : 'evaluating'
    const t = assertTransition('SM-REC-004', path.status, toStatus, 'waitlist_off')
    if (!t.ok) return err(t.reason || '当前路径不可取消候补')
    path.waitlist = false
    if (path.decided === 'admit') path.status = 'decided'
    else path.status = 'evaluating'
  }
  path.version += 1
  app.version += 1
  return ok()
}

export function submitReview(activityId: string, applicantId: string, input: { comment: string; rating: number; authorId: string; authorName: string; authorRole: string; roundId?: string | null; expectedVersion?: number }): { ok: boolean; error?: string; data?: RecReview } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'force_completed') return err('活动已结束，普通评价编辑已锁定')
  if (input.roundId) {
    const round = a.rounds.find((r) => r.id === input.roundId)
    if (round && (round.status === 'closed' || round.status === 'cancelled')) return err('该轮次已关闭，评价已锁定；如需修改请走事实纠错')
  }
  let rev = recruitmentReviews.find((r) => r.activityId === activityId && r.applicantId === applicantId && r.authorId === input.authorId)
  if (rev) {
    // P2-8 乐观锁：更新已有评价时比对 expectedVersion，防止多标签页/并发覆盖
    if (input.expectedVersion !== undefined && rev.version !== input.expectedVersion) {
      return err('数据版本已变化，请刷新后重试')
    }
    rev.history = [
      ...(rev.history || []),
      { comment: rev.comment, version: rev.version, updatedAt: rev.updatedAt },
    ]
    rev.comment = input.comment
    rev.rating = input.rating
    if (input.roundId) rev.roundId = input.roundId
    rev.version += 1
    rev.updatedAt = now()
  } else {
    rev = { id: 'rev-' + Date.now(), activityId, applicantId, authorId: input.authorId, authorName: input.authorName, authorRole: input.authorRole, comment: input.comment, rating: input.rating, roundId: input.roundId, version: 1, createdAt: now(), updatedAt: now() }
    recruitmentReviews.push(rev)
    a.reviewIds.push(rev.id)
  }
  return ok(rev)
}

export function publishDepartmentResult(activityId: string, applicantId: string, departmentId: string, actorName: string): { ok: boolean; error?: string } {
  void actorName
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const path = app.paths[departmentId]
  if (!path) return err('路径不存在')
  if (path.status !== 'decided' && path.status !== 'waitlist') return err('该路径尚未形成可发布的决定')
  const t = assertTransition('SM-REC-004', path.status, 'published', 'publish')
  if (!t.ok) return err(t.reason || '该路径尚未形成可发布的决定')
  path.status = 'published'
  path.publishedAt = now()
  path.version += 1
  app.version += 1
  return ok()
}

export function createRecInvitation(activityId: string, applicantId: string, departmentId: string, expireDays: number, actorName: string): { ok: boolean; error?: string; data?: RecInvitation } {
  void actorName
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  if (app.status !== 'submitted' && app.status !== 'not_qualified') return err('该申请当前不可发送邀请')
  const path = app.paths[departmentId]
  if (!path || path.decided !== 'admit') return err('请先形成该部门的录取决定')
  const dup = recruitmentInvitations.some((i) => i.activityId === activityId && i.applicantId === applicantId && i.status === 'pending_acceptance')
  if (dup) return err('该申请人已有一份待处理录取邀请')
  const inv: RecInvitation = {
    id: 'rinv-' + Date.now(), activityId, clubId: a.clubId, applicantId, applicantName: app.applicantName,
    departmentId, departmentName: path.departmentName, status: 'pending_acceptance',
    sentAt: now(), expiredAt: daysFromNow(expireDays || 7), acceptedAt: null, casdoorSync: 'none', version: 1,
  }
  recruitmentInvitations.unshift(inv)
  a.invitationIds.push(inv.id)
  return ok(inv)
}

export function respondRecInvitation(invitationId: string, action: 'accept' | 'reject', applicantId: string): { ok: boolean; error?: string; data?: RecInvitation } {
  const inv = findInvitation(invitationId)
  if (!inv) return err('邀请不存在')
  if (inv.applicantId !== applicantId) return err('只能处理发给自己的邀请')
  const t = assertTransition('SM-INV-001', inv.status, action === 'accept' ? 'accepted' : 'rejected', action)
  if (!t.ok) return err(t.reason || '该邀请已处理')
  if (new Date(inv.expiredAt).getTime() < Date.now()) {
    inv.status = 'expired'
    return err('邀请已过期')
  }
  inv.status = action === 'accept' ? 'accepted' : 'rejected'
  if (action === 'accept') {
    inv.acceptedAt = now()
    inv.casdoorSync = 'processing'
    const app = findApplication(inv.activityId, inv.applicantId)
    if (app) {
      app.status = 'accepted'
      app.version += 1
    }
  }
  inv.version += 1
  return ok(inv)
}

export function withdrawRecInvitation(invitationId: string): { ok: boolean; error?: string } {
  const inv = findInvitation(invitationId)
  if (!inv) return err('邀请不存在')
  const t = assertTransition('SM-INV-001', inv.status, 'withdrawn', 'withdraw')
  if (!t.ok) return err(t.reason || '仅待处理的邀请可撤回')
  inv.status = 'withdrawn'
  inv.version += 1
  return ok()
}

export function reissueRecInvitation(invitationId: string, expireDays: number): { ok: boolean; error?: string; data?: RecInvitation } {
  const old = findInvitation(invitationId)
  if (!old) return err('邀请不存在')
  if (!['rejected', 'withdrawn', 'expired'].includes(old.status)) return err('仅已拒绝/撤回/过期的邀请可重发')
  const dup = recruitmentInvitations.some((i) => i.activityId === old.activityId && i.applicantId === old.applicantId && i.status === 'pending_acceptance')
  if (dup) return err('该申请人已有一份待处理录取邀请')
  const inv: RecInvitation = {
    id: 'rinv-' + Date.now(), activityId: old.activityId, clubId: old.clubId, applicantId: old.applicantId,
    applicantName: old.applicantName, departmentId: old.departmentId, departmentName: old.departmentName,
    status: 'pending_acceptance', sentAt: now(), expiredAt: daysFromNow(expireDays || 7), acceptedAt: null, casdoorSync: 'none', version: 1,
  }
  recruitmentInvitations.unshift(inv)
  const a = findAnyActivity(old.activityId)
  a?.invitationIds.push(inv.id)
  return ok(inv)
}

export function confirmRecInvitationSync(invitationId: string): { ok: boolean; error?: string; data?: RecInvitation } {
  const inv = findInvitation(invitationId)
  if (!inv) return err('邀请不存在')
  if (inv.status === 'sync_failed') {
    // P2-3：同步失败后可重试（SM-INV-001 sync_failed --retry--> accepted），再走既有生效链路
    const t = assertTransition('SM-INV-001', inv.status, 'accepted', 'retry')
    if (!t.ok) return err(t.reason || '当前状态不可重试')
    inv.status = 'accepted'
    inv.casdoorSync = 'processing'
    return confirmRecInvitationSync(invitationId)
  }
  if (inv.status !== 'accepted') return err('仅已接受的邀请可执行成员同步确认')
  if (inv.casdoorSync === 'processing') {
    // 先创建成员再翻转同步状态：成员创建失败时保持 processing，可重试，避免卡在「已确认但无成员」中间态
    const contact = resolveApplicantContact(applicantStudentIdOf(inv.applicantId))
    const admitted = createMemberFromAdmission(inv.clubId, {
      studentId: applicantStudentIdOf(inv.applicantId),
      name: inv.applicantName,
      departmentId: inv.departmentId,
      departmentName: inv.departmentName,
      acceptedAt: inv.acceptedAt || now(),
      ...contact,
    })
    if (!admitted.ok) return err(admitted.error || '成员创建失败')
    inv.casdoorSync = 'confirmed'
    inv.version += 1
    return ok(inv)
  }
  return err('成员同步已完成或已失败')
}

// ================= JNT =================

export function createJointActivity(clubId: string, clubName: string, actorName: string, input: { title: string; description?: string; clubIds: string[]; confirmDeadline: string; sharedAgreement?: string }): { ok: boolean; error?: string; data?: JointActivity } {
  if (input.clubIds.length < 2) return err('联合活动至少需要两个拟参与社团')
  if (!input.clubIds.includes(clubId)) return err('发起方社团必须包含在拟参与名单中')
  if (!input.title.trim()) return err('联合活动名称不能为空')
  if (new Date(input.confirmDeadline).getTime() <= Date.now()) return err('名单确认截止必须严格晚于当前时刻')
  const clubNames: Record<string, string> = { 'club-001': '计算机协会', 'club-002': '电子设计协会', 'club-003': '数学建模协会' }
  const ja: JointActivity = {
    id: 'jnt-' + Date.now(), title: input.title, description: input.description || '',
    status: 'draft',
    clubs: input.clubIds.map((cid) => ({
      clubId: cid, clubName: clubNames[cid] || (cid === clubId ? clubName : cid),
      status: cid === clubId ? 'accepted' : 'invited',
      confirmedAt: cid === clubId ? now() : null,
      confirmedBy: cid === clubId ? actorName : null,
      suspendedSince: null,
      departments: JOINT_CLUB_DEPARTMENTS[cid] || [],
    })),
    confirmRound: 1, confirmDeadline: input.confirmDeadline,
    sharedAgreement: { version: 1, text: input.sharedAgreement || '您的报名资料将在全部参与社团之间共享，用于联合面试与选拔。' },
    formId: 'form-001', formVersion: 1,
    channelStatus: 'not_open', channelPausedBefore: null, pauseStartAt: null, channelOpenedAt: null,
    deadline: daysFromNow(10), deadlineVersion: 1, window: { seq: 1, deadline: daysFromNow(10) },
    publishedAt: null, firstInviteAt: null, closedAt: null, forceClosedAt: null,
    cancelConfirmRound: 0, cancelConfirmDeadline: null, cancelConfirmations: {},
    endConfirmRound: 0, endConfirmDeadline: null, endConfirmations: {},
    applicantIds: [], version: 1, createdAt: now(),
  }
  jointActivities.unshift(ja)
  return ok(ja)
}

export function confirmJointParticipation(jointId: string, clubId: string, actorName: string): { ok: boolean; error?: string; data?: JointActivity } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const club = ja.clubs.find((c) => c.clubId === clubId)
  if (!club) return err('该社团不在拟参与名单中')
  if (ja.status !== 'draft') return err('联合活动已成立或已公布，名单已锁定')
  if (new Date(ja.confirmDeadline).getTime() < Date.now()) return err('确认期限已过')
  const t = assertTransition('SM-JNT-002', club.status, 'accepted', 'confirm')
  if (!t.ok) return err(t.reason || '该社团当前不可确认')
  club.status = 'accepted'
  club.confirmedAt = now()
  club.confirmedBy = actorName
  const allConfirmed = ja.clubs.every((c) => c.status === 'accepted')
  if (allConfirmed) {
    const t2 = assertTransition('SM-JNT-001', ja.status, 'confirmed', 'confirm_all')
    if (t2.ok) ja.status = 'confirmed'
  }
  ja.version += 1
  return ok(ja)
}

export function adjustJointClubList(jointId: string, clubIds: string[], newDeadline: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.status !== 'draft') return err('已首次公布的联合活动名单永久锁定')
  if (clubIds.length < 2) return err('联合活动至少需要两个参与社团')
  ja.clubs = clubIds.map((cid) => {
    const old = ja.clubs.find((c) => c.clubId === cid)
    return old ? { ...old, status: old.status === 'accepted' ? 'confirm_pending' : old.status, confirmedAt: old.status === 'accepted' ? null : old.confirmedAt, confirmedBy: old.status === 'accepted' ? null : old.confirmedBy } : { clubId: cid, clubName: cid, status: 'invited', confirmedAt: null, confirmedBy: null, suspendedSince: null, departments: JOINT_CLUB_DEPARTMENTS[cid] || [] }
  })
  ja.confirmRound += 1
  ja.confirmDeadline = newDeadline
  ja.version += 1
  return ok()
}

export function withdrawJointParticipation(jointId: string, clubId: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.status !== 'draft') return err('已首次公布的联合活动名单永久锁定')
  const t = assertTransition('SM-JNT-002', ja.clubs.find((c) => c.clubId === clubId)?.status || '', 'removed', 'withdraw')
  if (!t.ok) return err(t.reason || '该社团当前不可撤回参与意向')
  ja.clubs = ja.clubs.filter((c) => c.clubId !== clubId)
  ja.confirmRound += 1
  ja.confirmDeadline = daysFromNow(5)
  ja.version += 1
  return ok()
}

export function publishJointActivity(jointId: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-001', ja.status, 'published', 'first_publish')
  if (!t.ok) return err(t.reason || '当前状态不可首次公布')
  if (!ja.clubs.every((c) => c.status === 'accepted')) return err('全部拟参与社团确认后才能首次公布')
  ja.status = 'published'
  ja.publishedAt = now()
  ja.channelOpenedAt = now()
  ja.clubs.forEach((c) => (c.status = 'locked'))
  // 自动推进渠道状态: 已发布后若渠道仍为 not_open，则自动开放
  if (ja.channelStatus === 'not_open') {
    const tc = assertTransition('SM-JNT-006', ja.channelStatus, 'open', 'first_open')
    if (tc.ok) {
      ja.channelStatus = 'open'
      ja.deadlineVersion += 1
      ja.window = { seq: ja.window.seq + 1, deadline: ja.deadline }
    }
  }
  ja.version += 1
  return ok()
}

/**
 * 过滤部门意向（先选协会才能选部门）：
 * - volunteerClubIds 未传（undefined）时默认全部参与社团；空数组表示用户已清空全部意向社团，不取任何部门
 * - 部门名称以服务端权威数据为准（反查 ja.clubs 的 departments），不信任客户端；按 departmentId 去重，保留优先级顺序
 */
function filterJointPreferences(ja: JointActivity, prefs?: { departmentId: string; departmentName: string }[], volunteerClubIds?: string[]): { departmentId: string; departmentName: string }[] {
  if (!prefs) return []
  const authoritative = new Map<string, string>()
  for (const c of ja.clubs) {
    if (volunteerClubIds !== undefined && !volunteerClubIds.includes(c.clubId)) continue
    for (const d of c.departments) {
      if (!authoritative.has(d.id)) authoritative.set(d.id, d.name)
    }
  }
  const seen = new Set<string>()
  const out: { departmentId: string; departmentName: string }[] = []
  for (const p of prefs) {
    const name = authoritative.get(p.departmentId)
    if (name === undefined || seen.has(p.departmentId)) continue
    seen.add(p.departmentId)
    out.push({ departmentId: p.departmentId, departmentName: name })
  }
  return out
}

export function saveJointApplicationDraft(
  jointId: string,
  applicantId: string,
  applicantName: string,
  studentId: string,
  input?: { answers?: Record<string, unknown>; volunteerClubIds?: string[]; allowJointAdjustment?: boolean; consented?: boolean; preferences?: { departmentId: string; departmentName: string }[]; expectedVersion?: number },
): { ok: boolean; error?: string; data?: JointApplication } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.status === 'draft' || ja.status === 'confirmed') return err('联合活动尚未首次公布')
  let app = findJointApplication(jointId, applicantId)
  if (!app) {
    app = {
      id: 'japp-' + Date.now(), jointId, applicantId, applicantName, studentId,
      status: 'draft', consented: false, consentAt: null, agreementVersion: null,
      allowJointAdjustment: true, volunteerClubIds: [], volunteerClubSnapshot: [], preferences: [], agreementClubSnapshot: [], answers: {}, formVersion: ja.formVersion, submittedAt: null, version: 1,
    }
    jointApplications.push(app)
    ja.applicantIds.push(app.id)
  }
  // P2-8 乐观锁：已有草稿时比对 expectedVersion，防止多标签页/并发覆盖
  if (input?.expectedVersion !== undefined && app.version !== input.expectedVersion) {
    return err('数据版本已变化，请刷新后重试')
  }
  app.consented = input?.consented ?? app.consented
  app.allowJointAdjustment = input?.allowJointAdjustment ?? app.allowJointAdjustment
  if (input?.volunteerClubIds !== undefined) {
    app.volunteerClubIds = input.volunteerClubIds.filter((id) => ja.clubs.some((c) => c.clubId === id))
  }
  if (input?.preferences) {
    app.preferences = filterJointPreferences(ja, input.preferences, input.volunteerClubIds !== undefined ? app.volunteerClubIds : undefined)
  }
  if (input?.answers) app.answers = { ...app.answers, ...input.answers }
  app.formVersion = ja.formVersion
  app.version += 1
  return ok(app)
}

export function submitJointApplication(jointId: string, applicantId: string, input: { consented: boolean; allowJointAdjustment: boolean; volunteerClubIds?: string[]; answers?: Record<string, unknown>; preferences?: { departmentId: string; departmentName: string }[] }): { ok: boolean; error?: string; data?: JointApplication } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.channelStatus !== 'open') return err('联合报名通道当前未开放')
  if (new Date(ja.deadline).getTime() < Date.now()) return err('联合报名已截止')
  if (!input.consented) return err('拒绝跨社团共享即不能参加本次联合活动')
  const app = findJointApplication(jointId, applicantId)
  if (!app) return err('请先创建联合申请草稿')
  const t = assertTransition('SM-JNT-003', app.status, 'submitted', 'submit')
  if (!t.ok) return err(t.reason || '当前联合申请不可提交')
  app.status = 'submitted'
  app.consented = true
  app.consentAt = now()
  app.agreementVersion = ja.sharedAgreement.version
  app.agreementClubSnapshot = ja.clubs.map((c) => c.clubName)
  app.allowJointAdjustment = input.allowJointAdjustment
  const availableClubIds = ja.clubs.map((c) => c.clubId)
  const volunteerClubIds = input.volunteerClubIds
  app.volunteerClubIds = volunteerClubIds !== undefined
    ? availableClubIds.filter((id) => volunteerClubIds.includes(id))
    : availableClubIds
  const byId = new Map(ja.clubs.map((c) => [c.clubId, c.clubName]))
  app.volunteerClubSnapshot = app.volunteerClubIds.map((id) => byId.get(id) || id)
  app.preferences = filterJointPreferences(ja, input.preferences, app.volunteerClubIds)
  app.answers = { ...(input.answers || {}) }
  app.formVersion = ja.formVersion
  app.submittedAt = now()
  app.version += 1
  const existing = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!existing) {
    jointInterviews.push({
      id: 'jint-' + Date.now(), jointId, applicantId, applicantName: app.applicantName,
      status: 'pending_selection', slotId: null, startAt: null, endAt: null,
      actualStartAt: null, actualEndAt: null, attendance: 'none', invalidReason: null, attempt: 1, version: 1,
    })
  }
  for (const c of ja.clubs) {
    if (c.status !== 'locked' && c.status !== 'force_suspended') continue
    const con = jointConclusions.find((x) => x.jointId === jointId && x.applicantId === applicantId && x.clubId === c.clubId)
    if (!con) {
      jointConclusions.push({
        id: 'jcon-' + Date.now(), jointId, applicantId, clubId: c.clubId, clubName: c.clubName,
        status: 'pending', conclusion: null, reviewFlag: false, inviteId: null, versions: [], version: 1,
      })
    }
  }
  return ok(app)
}

/**
 * 撤销联合报名提交的预判原因（只读，不执行变更）：与 withdrawJointApplication 同源校验，
 * 供「我的联合申请」详情返回 withdrawBlockedReason。
 */
export function withdrawJointApplicationBlockedReason(jointId: string, applicantId: string): string | null {
  const ja = findJoint(jointId)
  if (!ja) return '联合活动不存在'
  if (['closed', 'cancelled', 'force_closed'].includes(ja.status)) return '联合活动已结束，无法撤销提交'
  if (ja.channelStatus !== 'open') return '联合报名通道已关闭，无法撤销提交'
  if (new Date(ja.deadline).getTime() < Date.now()) return '联合报名已截止，无法撤销提交'
  const app = findJointApplication(jointId, applicantId)
  if (!app) return '联合申请不存在'
  const t = assertTransition('SM-JNT-003', app.status, 'draft', 'withdraw')
  if (!t.ok) return t.reason || '仅已提交的联合申请可撤销'
  const interview = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (interview && interview.status !== 'pending_selection') return '已安排面试，无法撤销提交'
  const activeConclusion = jointConclusions.find((c) => c.jointId === jointId && c.applicantId === applicantId && c.status !== 'pending')
  if (activeConclusion) return '已有审核结论，无法撤销提交'
  return null
}

/**
 * 撤销联合报名提交（submitted → draft）：仅通道开放且未截止时可撤销；
 * 已有排期面试或形成审核结论时拒绝；撤销时清理未排期面试记录、待审结论，
 * 并作废未关联结论的待处理邀请（与普通版 withdrawApplicationSubmission 同规范）。
 */
export function withdrawJointApplication(jointId: string, applicantId: string): { ok: boolean; error?: string; data?: JointApplication } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (['closed', 'cancelled', 'force_closed'].includes(ja.status)) return err('联合活动已结束，无法撤销提交')
  if (ja.channelStatus !== 'open') return err('联合报名通道已关闭，无法撤销提交')
  if (new Date(ja.deadline).getTime() < Date.now()) return err('联合报名已截止，无法撤销提交')
  const app = findJointApplication(jointId, applicantId)
  if (!app) return err('联合申请不存在')
  const t = assertTransition('SM-JNT-003', app.status, 'draft', 'withdraw')
  if (!t.ok) return err(t.reason || '仅已提交的联合申请可撤销')
  const interview = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (interview && interview.status !== 'pending_selection') return err('已安排面试，无法撤销提交')
  const activeConclusion = jointConclusions.find((c) => c.jointId === jointId && c.applicantId === applicantId && c.status !== 'pending')
  if (activeConclusion) return err('已有审核结论，无法撤销提交')
  const idx = jointInterviews.findIndex((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (idx >= 0) jointInterviews.splice(idx, 1)
  for (let i = jointConclusions.length - 1; i >= 0; i--) {
    const con = jointConclusions[i]
    if (con.jointId === jointId && con.applicantId === applicantId && con.status === 'pending') jointConclusions.splice(i, 1)
  }
  for (const inv of jointInvitations) {
    if (inv.jointId === jointId && inv.applicantId === applicantId && inv.status === 'pending_acceptance') {
      inv.status = 'expired'
      inv.reviewFlag = false
    }
  }
  app.status = 'draft'
  app.submittedAt = null
  app.consented = false
  app.consentAt = null
  app.agreementVersion = null
  app.agreementClubSnapshot = []
  app.volunteerClubSnapshot = []
  app.version += 1
  return ok(app)
}

export function bookJointInterview(jointId: string, applicantId: string, slotId: string, actorIsAdmin: boolean): { ok: boolean; error?: string; data?: JointInterview } {
  void actorIsAdmin
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const slot = jointSlots.find((s) => s.id === slotId && s.jointId === jointId)
  if (!slot) return err('时间段不存在')
  if (slot.taken >= slot.capacity) return err('该时段已满员')
  const it = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!it) return err('联合申请记录不存在')
  const fromStatus = it.status === 'pending_selection' ? 'pending_selection' : it.status
  const event = it.status === 'scheduled' ? 'reschedule'
    : ['invalidated', 'leave', 'late', 'absent'].includes(it.status) ? 'rearrange'
    : 'select'
  const t = assertTransition('SM-JNT-004', fromStatus, 'scheduled', event)
  if (!t.ok) return err(t.reason || '当前面试记录不可预约')
  const conflict = applicantTimeConflict(applicantId, slot.startAt, slot.endAt, it.id)
  if (conflict.conflict) return err(conflict.detail || '该时段与既有安排冲突')
  if (it.slotId && it.slotId !== slot.id) {
    const oldSlot = jointSlots.find((s) => s.id === it.slotId && s.jointId === jointId)
    if (oldSlot) oldSlot.taken = Math.max(0, oldSlot.taken - 1)
  }
  it.status = 'scheduled'
  it.slotId = slot.id
  it.startAt = slot.startAt
  it.endAt = slot.endAt
  it.attendance = 'none'
  it.version += 1
  slot.taken += 1
  return ok(it)
}

export function markJointAttendance(jointId: string, applicantId: string, event: 'leave' | 'late' | 'absent'): { ok: boolean; error?: string } {
  const it = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!it) return err('联合面试记录不存在')
  const t = assertTransition('SM-JNT-004', it.status, event, event)
  if (!t.ok) return err(t.reason || '当前状态不可标记出勤')
  it.status = event
  it.attendance = event
  const slot = jointSlots.find((s) => s.id === it.slotId && s.jointId === jointId)
  if (slot) slot.taken = Math.max(0, slot.taken - 1)
  it.slotId = null
  it.startAt = null
  it.endAt = null
  it.version += 1
  return ok()
}

export function startJointInterview(jointId: string, applicantId: string): { ok: boolean; error?: string } {
  const it = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!it) return err('联合面试记录不存在')
  const t = assertTransition('SM-JNT-004', it.status, 'in_progress', 'start')
  if (!t.ok) return err(t.reason || '当前状态不可开始')
  it.status = 'in_progress'
  it.actualStartAt = now()
  it.version += 1
  return ok()
}

export function completeJointInterview(jointId: string, applicantId: string): { ok: boolean; error?: string } {
  const it = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!it) return err('联合面试记录不存在')
  const t = assertTransition('SM-JNT-004', it.status, 'completed', 'complete')
  if (!t.ok) return err(t.reason || '当前状态不可完成')
  it.status = 'completed'
  it.actualEndAt = now()
  it.attendance = 'present'
  it.version += 1
  return ok()
}

/** author_evaluate 接线（SM-JNT-004）：作者评价完成时对已完成的联合面试应用该转换（自环），校验状态机契约 */
export function applyJointInterviewAuthorEvaluate(jointId: string, applicantId: string): { ok: boolean; error?: string } {
  const it = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!it) return ok()
  const t = assertTransition('SM-JNT-004', it.status, 'completed', 'author_evaluate')
  if (!t.ok) return err(t.reason || '面试未完成，暂不能评价')
  it.status = 'completed'
  it.version += 1
  return ok()
}

/** 联合面试作废：跨对象联动（结论/邀请加待复核标志+冻结剩余时长） */
export function invalidateJointInterview(jointId: string, applicantId: string, reason: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const it = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!it) return err('联合面试记录不存在')
  const t = assertTransition('SM-JNT-004', it.status, 'invalidated', 'invalidate')
  if (!t.ok) return err(t.reason || '当前状态不可作废')
  if (!reason.trim()) return err('作废必须填写原因')
  it.status = 'invalidated'
  it.invalidReason = reason
  it.version += 1
  if (it.slotId) {
    const slot = jointSlots.find((s) => s.id === it.slotId)
    if (slot) slot.taken = Math.max(0, slot.taken - 1)
    it.slotId = null
    it.startAt = null
    it.endAt = null
  }
  for (const con of jointConclusions) {
    if (con.jointId !== jointId || con.applicantId !== applicantId) continue
    if (con.status === 'accepted_locked') continue
    con.reviewFlag = true
    con.version += 1
    if (con.inviteId) {
      const inv = jointInvitations.find((x) => x.id === con.inviteId)
      if (inv && inv.status === 'pending_acceptance') {
        inv.reviewFlag = true
        inv.frozenRemainingMs = Math.max(0, new Date(inv.expiredAt).getTime() - Date.now())
        inv.version += 1
      }
    }
  }
  return ok()
}

/** 补面完成后复核本社团结论：保留原结论清除标志（邀请恢复冻结剩余时长）或修改结论重发邀请 */
export function reviewJointConclusion(jointId: string, applicantId: string, clubId: string, action: 'keep' | 'modify', actorName: string, actorRole: string, newConclusion?: 'admit' | 'not_admit'): { ok: boolean; error?: string } {
  const it = jointInterviews.find((i) => i.jointId === jointId && i.applicantId === applicantId)
  if (!it || it.status !== 'completed') return err('补面完成后才能复核结论')
  const con = jointConclusions.find((c) => c.jointId === jointId && c.applicantId === applicantId && c.clubId === clubId)
  if (!con) return err('结论不存在')
  if (!con.reviewFlag) return err('该结论无需复核')
  if (action === 'keep') {
    con.reviewFlag = false
    if (con.inviteId) {
      const inv = jointInvitations.find((x) => x.id === con.inviteId)
      if (inv && inv.reviewFlag && inv.frozenRemainingMs != null) {
        inv.reviewFlag = false
        inv.expiredAt = new Date(Date.now() + inv.frozenRemainingMs).toISOString()
        inv.frozenRemainingMs = null
        inv.version += 1
      }
    }
  } else {
    if (!newConclusion) return err('修改结论必须提供新结论')
    con.conclusion = newConclusion
    con.versions.push({ conclusion: newConclusion, changedBy: actorName, changedByRole: actorRole, reason: null, at: now() })
    if (con.inviteId) {
      const oldInv = jointInvitations.find((x) => x.id === con.inviteId)
      if (oldInv && oldInv.status === 'pending_acceptance') {
        oldInv.status = 'withdrawn'
        oldInv.reviewFlag = false
        oldInv.version += 1
      }
    }
    if (newConclusion === 'admit') {
      const inv: JointInvitation = {
        id: 'jinv-' + Date.now(), jointId, clubId, applicantId, type: 'admit',
        status: 'pending_acceptance', sentAt: now(), expiredAt: daysFromNow(7), acceptedAt: null,
        reviewFlag: false, frozenRemainingMs: null, casdoorSync: 'none', version: 1,
      }
      // SM-JNT-005：invite_pending 先回退 evaluating（invite_terminal），再 evaluating→invite_pending（create_invite）
      if (con.status === 'invite_pending') {
        const mv0 = moveJointConclusion(con, 'invite_terminal', 'evaluating')
        if (!mv0.ok) return err(mv0.reason || '结论状态不可回退')
      }
      const mv = moveJointConclusion(con, 'create_invite', 'invite_pending')
      if (!mv.ok) return err(mv.reason || '结论状态不可发送邀请')
      jointInvitations.unshift(inv)
      con.inviteId = inv.id
    } else {
      // SM-JNT-005：invite_pending→evaluating（invite_terminal）或保持 evaluating
      if (con.status === 'invite_pending') {
        const mv = moveJointConclusion(con, 'invite_terminal', 'evaluating')
        if (!mv.ok) return err(mv.reason || '结论状态不可回退')
      }
      con.inviteId = null
    }
    con.reviewFlag = false
  }
  con.version += 1
  return ok()
}

/** SM-JNT-005 结论状态机守卫写入：断言通过才落库。
 * 新提交产生的结论从 pending 起步，写入非 evaluating 目标前先补 create（pending→evaluating）
 * （createJointInvitation 对未设结论的 pending 结论发 join 调剂邀请时同样适用）。 */
function moveJointConclusion(con: JointConclusion, event: string, toStatus: JointConclusionStatus): { ok: boolean; reason?: string } {
  let from = con.status
  if (from === 'pending' && toStatus !== 'evaluating') {
    const t0 = assertTransition('SM-JNT-005', from, 'evaluating', 'create')
    if (!t0.ok) return t0
    from = 'evaluating'
  }
  const t = assertTransition('SM-JNT-005', from, toStatus, event)
  if (!t.ok) return t
  con.status = toStatus
  return { ok: true }
}

export function setJointConclusion(jointId: string, applicantId: string, clubId: string, conclusion: 'admit' | 'not_admit', actorName: string, actorRole: string): { ok: boolean; error?: string; data?: JointConclusion } {
  const con = jointConclusions.find((c) => c.jointId === jointId && c.applicantId === applicantId && c.clubId === clubId)
  if (!con) return err('结论不存在')
  if (con.status === 'accepted_locked') return err('该结论已因邀请接受而锁定，不可修改')
  if (con.status === 'archived') return err('活动已结束，结论已归档')
  if (con.inviteId) {
    const inv = jointInvitations.find((x) => x.id === con.inviteId)
    if (inv && inv.status === 'pending_acceptance') return err('存在待处理邀请，请先撤回或等待处理')
  }
  // SM-JNT-005：pending 首次写入走 create、invite_pending 邀请终态后重设走 invite_terminal、其余走 modify
  const fromStatus = con.status
  const event = fromStatus === 'pending' ? 'create' : fromStatus === 'invite_pending' ? 'invite_terminal' : 'modify'
  const t = assertTransition('SM-JNT-005', fromStatus, 'evaluating', event)
  if (!t.ok) return err(t.reason || '当前结论状态不可修改')
  con.status = 'evaluating'
  con.conclusion = conclusion
  con.versions.push({ conclusion, changedBy: actorName, changedByRole: actorRole, reason: null, at: now() })
  con.version += 1
  return ok(con)
}

export function createJointInvitation(jointId: string, applicantId: string, clubId: string, expireDays: number): { ok: boolean; error?: string; data?: JointInvitation } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const app = findJointApplication(jointId, applicantId)
  if (!app || app.status !== 'submitted') return err('联合申请不存在或未提交')
  const isParticipant = ja.clubs.some((c) => c.clubId === clubId && (c.status === 'locked' || c.status === 'force_suspended'))
  if (!isParticipant) return err('该社团不是参与社团')
  const con = jointConclusions.find((c) => c.jointId === jointId && c.applicantId === applicantId && c.clubId === clubId)
  const hasVolunteered = app.volunteerClubIds.includes(clubId)
  const type: 'admit' | 'join' = hasVolunteered ? 'admit' : 'join'
  if (type === 'join' && !app.allowJointAdjustment) return err('申请人未选择服从联合调剂，不能发出加入邀请')
  const dup = jointInvitations.some((i) => i.jointId === jointId && i.applicantId === applicantId && i.clubId === clubId && i.status === 'pending_acceptance')
  if (dup) return err('该申请人已有一份待处理联合邀请')
  const inv: JointInvitation = {
    id: 'jinv-' + Date.now(), jointId, clubId, applicantId, type,
    status: 'pending_acceptance', sentAt: now(), expiredAt: daysFromNow(expireDays || 7), acceptedAt: null,
    reviewFlag: false, frozenRemainingMs: null, casdoorSync: 'none', version: 1,
  }
  jointInvitations.unshift(inv)
  if (con) {
    // SM-JNT-005：evaluating→invite_pending（create_invite）；pending 未设结论时先 create→evaluating
    const move = moveJointConclusion(con, 'create_invite', 'invite_pending')
    if (!move.ok) {
      const ci = jointInvitations.findIndex((x) => x.id === inv.id)
      if (ci >= 0) jointInvitations.splice(ci, 1)
      return err(move.reason || '当前结论状态不可发送邀请')
    }
    con.inviteId = inv.id
    con.version += 1
  }
  if (!ja.firstInviteAt) {
    ja.firstInviteAt = now()
    const t = assertTransition('SM-JNT-001', ja.status, 'invite_phase', 'first_invite')
    if (t.ok) ja.status = 'invite_phase'
  }
  ja.version += 1
  return ok(inv)
}

export function respondJointInvitation(invitationId: string, action: 'accept' | 'reject', applicantId: string): { ok: boolean; error?: string; data?: JointInvitation } {
  const inv = findJointInvitation(invitationId)
  if (!inv) return err('邀请不存在')
  if (inv.applicantId !== applicantId) return err('只能处理发给自己的邀请')
  if (inv.reviewFlag) {
    if (action === 'accept') return err('补面结论待复核，暂不可接受')
    inv.status = 'rejected'
    const con = jointConclusions.find((c) => c.inviteId === inv.id)
    if (con) {
      // SM-JNT-005：invite_pending→evaluating（invite_terminal）
      const mv = moveJointConclusion(con, 'invite_terminal', 'evaluating')
      if (!mv.ok) return err(mv.reason || '结论状态不可回退')
      con.reviewFlag = false
      con.inviteId = null
      con.version += 1
    }
    inv.version += 1
    return ok(inv)
  }
  const t = assertTransition('SM-INV-001', inv.status, action === 'accept' ? 'accepted' : 'rejected', action)
  if (!t.ok) return err(t.reason || '该邀请已处理')
  if (new Date(inv.expiredAt).getTime() < Date.now()) {
    inv.status = 'expired'
    const con = jointConclusions.find((c) => c.inviteId === inv.id)
    if (con) {
      // SM-JNT-005：invite_pending→evaluating（invite_terminal）
      const mv = moveJointConclusion(con, 'invite_terminal', 'evaluating')
      if (!mv.ok) return err(mv.reason || '结论状态不可回退')
      con.inviteId = null
      con.version += 1
    }
    return err('邀请已过期')
  }
  inv.status = action === 'accept' ? 'accepted' : 'rejected'
  if (action === 'accept') {
    inv.acceptedAt = now()
    inv.casdoorSync = 'processing'
    const con = jointConclusions.find((c) => c.inviteId === inv.id)
    if (con) {
      // SM-JNT-005：invite_pending→accepted_locked（accepted）
      const mv = moveJointConclusion(con, 'accepted', 'accepted_locked')
      if (!mv.ok) return err(mv.reason || '结论状态不可锁定')
      con.conclusion = 'admit'
      con.reviewFlag = false
      con.version += 1
    }
  } else {
    const con = jointConclusions.find((c) => c.inviteId === inv.id)
    if (con) {
      // SM-JNT-005：invite_pending→evaluating（invite_terminal）
      const mv = moveJointConclusion(con, 'invite_terminal', 'evaluating')
      if (!mv.ok) return err(mv.reason || '结论状态不可回退')
      con.inviteId = null
      con.version += 1
    }
  }
  inv.version += 1
  return ok(inv)
}

export function withdrawJointInvitation(invitationId: string): { ok: boolean; error?: string } {
  const inv = findJointInvitation(invitationId)
  if (!inv) return err('邀请不存在')
  const t = assertTransition('SM-INV-001', inv.status, 'withdrawn', 'withdraw')
  if (!t.ok) return err(t.reason || '仅待处理的邀请可撤回')
  inv.status = 'withdrawn'
  const con = jointConclusions.find((c) => c.inviteId === inv.id)
  if (con) {
    // SM-JNT-005：invite_pending→evaluating（invite_terminal）
    const mv = moveJointConclusion(con, 'invite_terminal', 'evaluating')
    if (!mv.ok) return err(mv.reason || '结论状态不可回退')
    con.inviteId = null
    con.version += 1
  }
  inv.version += 1
  return ok()
}

export function confirmJointInvitationSync(invitationId: string): { ok: boolean; error?: string } {
  const inv = findJointInvitation(invitationId)
  if (!inv) return err('邀请不存在')
  if (inv.status === 'accepted' && inv.casdoorSync === 'processing') {
    // 先创建成员再翻转同步状态：成员创建失败时保持 processing，可重试，避免「已确认但无成员」中间态
    const app = findJointApplication(inv.jointId, inv.applicantId)
    const ja = findJoint(inv.jointId)
    const clubDepts = ja?.clubs.find((c) => c.clubId === inv.clubId)?.departments ?? []
    const pref = app?.preferences.find((p) => clubDepts.some((d) => d.id === p.departmentId))
    if (!pref) return err('报名意向中未匹配到该社团开设部门，无法确认生效，请先指定部门或调整意向')
    const studentId = app?.studentId ?? applicantStudentIdOf(inv.applicantId)
    const contact = resolveApplicantContact(studentId)
    const admitted = createMemberFromAdmission(inv.clubId, {
      studentId,
      name: app?.applicantName ?? applicantNameOf(inv.applicantId),
      departmentId: pref.departmentId,
      departmentName: pref.departmentName,
      acceptedAt: inv.acceptedAt || now(),
      ...contact,
    })
    if (!admitted.ok) return err(admitted.error || '成员创建失败')
    inv.casdoorSync = 'confirmed'
    inv.version += 1
    return ok()
  }
  return err('仅接受待同步的联合邀请可确认生效')
}

// ================= JNT 通道与结束 =================

export function openJointChannel(jointId: string, deadline: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-006', ja.channelStatus, 'open', 'first_open')
  if (!t.ok) return err(t.reason || '联合报名通道当前不可开放')
  if (ja.status === 'confirmed' || ja.status === 'draft') {
    const tp = assertTransition('SM-JNT-001', ja.status, 'published', 'first_publish')
    if (!tp.ok) return err('联合活动尚未成立，无法开放报名')
    ja.status = 'published'
    ja.publishedAt = now()
    ja.clubs.forEach((c) => (c.status = 'locked'))
  }
  if (new Date(deadline).getTime() <= Date.now()) return err('截止必须严格晚于当前时刻')
  ja.channelStatus = 'open'
  ja.deadline = deadline
  ja.deadlineVersion += 1
  if (!ja.channelOpenedAt) ja.channelOpenedAt = now()
  ja.version += 1
  return ok()
}

export function pauseJointChannel(jointId: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-006', ja.channelStatus, 'paused', 'pause')
  if (!t.ok) return err(t.reason || '联合报名通道当前不可暂停')
  // 暂停时记录起点，恢复时把暂停时长顺延到截止（对齐 resumeActivity 语义）
  ja.pauseStartAt = now()
  ja.channelStatus = 'paused'
  ja.version += 1
  return ok()
}

export function resumeJointChannel(jointId: string, newDeadline: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-006', ja.channelStatus, 'open', 'resume_with_deadline')
  if (!t.ok) return err(t.reason || '联合报名通道当前不可恢复')
  if (new Date(newDeadline).getTime() <= Date.now()) return err('新截止必须严格晚于当前时刻')
  // 若传入新截止则采用新截止；否则将暂停时长顺延到原截止（对齐 resumeActivity 语义）
  let nextDeadline = newDeadline
  if (!nextDeadline && ja.pauseStartAt) {
    const pausedMs = Date.now() - new Date(ja.pauseStartAt).getTime()
    nextDeadline = new Date(new Date(ja.deadline).getTime() + pausedMs).toISOString()
  }
  if (new Date(nextDeadline).getTime() <= Date.now()) return err('恢复后的截止必须严格晚于当前时刻')
  ja.channelStatus = 'open'
  ja.deadlineVersion += 1
  ja.window = { seq: ja.window.seq + 1, deadline: nextDeadline }
  ja.deadline = nextDeadline
  ja.pauseStartAt = null
  ja.version += 1
  return ok()
}

export function extendJointDeadline(jointId: string, newDeadline: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-006', ja.channelStatus, 'open', 'extend')
  if (!t.ok) return err('仅开放状态的联合报名通道可延长截止')
  if (new Date(newDeadline).getTime() <= new Date(ja.deadline).getTime()) return err('新截止必须严格晚于当前有效截止')
  ja.deadlineVersion += 1
  ja.deadline = newDeadline
  ja.version += 1
  return ok()
}

export function closeJointChannel(jointId: string, reason: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-006', ja.channelStatus, 'closed', 'manual_close')
  if (!t.ok) return err(t.reason || '联合报名通道当前不可关闭')
  if (!reason.trim()) return err('关闭必须填写原因')
  ja.channelStatus = 'closed'
  ja.version += 1
  return ok()
}

export function reopenJointChannel(jointId: string, newDeadline: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-006', ja.channelStatus, 'open', 'reopen_with_deadline')
  if (!t.ok) return err(t.reason || '联合报名通道当前不可重开')
  if (new Date(newDeadline).getTime() <= Date.now()) return err('新截止必须严格晚于当前时刻')
  ja.channelStatus = 'open'
  ja.deadlineVersion += 1
  ja.window = { seq: ja.window.seq + 1, deadline: newDeadline }
  ja.deadline = newDeadline
  ja.version += 1
  return ok()
}

export function cancelJointActivity(jointId: string, clubId: string, actorName: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.firstInviteAt) return err('已发出第一份邀请，联合活动不可再取消')
  const t = assertTransition('SM-JNT-001', ja.status, 'cancelled', 'collect_cancel')
  if (!t.ok) return err(t.reason || '当前状态不可取消')
  ja.cancelConfirmRound += 1
  ja.cancelConfirmDeadline = daysFromNow(3)
  ja.cancelConfirmations[clubId] = actorName
  const allCancel = ja.clubs.every((c) => ja.cancelConfirmations[c.clubId])
  if (allCancel) {
    ja.status = 'cancelled'
    ja.closedAt = now()
    ja.channelStatus = 'closed'
    for (const it of jointInterviews) {
      if (it.jointId === ja.id && ['pending_selection', 'scheduled'].includes(it.status)) {
        it.status = 'cancelled_archived'
        // 仅当面试仍持有 slot 引用时释放容量，并同步清空引用（与 markJointAttendance 约定一致）
        if (it.slotId) {
          const slot = jointSlots.find((s) => s.id === it.slotId && s.jointId === ja.id)
          if (slot) slot.taken = Math.max(0, slot.taken - 1)
          it.slotId = null
          it.startAt = null
          it.endAt = null
        }
      }
    }
    expireActivityTasks(jointId)
  }
  ja.version += 1
  return ok()
}

/**
 * 自动推进联合活动期限: 检测当前时刻与 deadline 的关系，推进状态机。
 * 不新增定时任务，在每次状态读取时调用（lazy evaluation）。
 * 到期推进前校验业务前置条件，避免跳过邀请/结束确认环节。
 */
export function autoAdvanceJointDeadlines(jointId: string): { ok: boolean; error?: string; changed?: boolean } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const nowMs = Date.now()
  let changed = false

  // 通道 deadline 已过: 自动关闭 open 状态的通道
  if (ja.channelStatus === 'open' && new Date(ja.deadline).getTime() <= nowMs) {
    const tc = assertTransition('SM-JNT-006', ja.channelStatus, 'closed', 'deadline_reached')
    if (tc.ok) {
      ja.channelStatus = 'closed'
      ja.version += 1
      changed = true
    }
  }

  // 活动 deadline 已过且从未发出邀请: 直接结束（SM-JNT-001 deadline_expired）
  if (ja.status === 'published' && !ja.firstInviteAt && new Date(ja.deadline).getTime() <= nowMs) {
    const ta = assertTransition('SM-JNT-001', ja.status, 'closed', 'deadline_expired')
    if (ta.ok) {
      ja.status = 'closed'
      ja.closedAt = now()
      ja.version += 1
      changed = true
    }
  }

  return { ok: true, changed }
}

/** 批量推进所有联合活动期限（按实际发生变更统计） */
export function autoAdvanceAllJointDeadlines(): number {
  let advanced = 0
  for (const ja of jointActivities) {
    const r = autoAdvanceJointDeadlines(ja.id)
    if (r.ok && r.changed) advanced++
  }
  return advanced
}

export function startJointEndConfirm(jointId: string, clubId: string, actorName: string): { ok: boolean; error?: string } {
  void clubId
  void actorName
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.status !== 'invite_phase') return err('仅已发出邀请的联合活动可进入结束确认')
  const pending = jointInvitations.some((i) => i.jointId === jointId && i.status === 'pending_acceptance')
  if (pending) return err('仍有待处理邀请，全部终态后才能进入结束确认')
  const t = assertTransition('SM-JNT-001', ja.status, 'closing_confirm', 'all_invites_final')
  if (!t.ok) return err(t.reason || '当前状态不可进入结束确认')
  ja.status = 'closing_confirm'
  ja.endConfirmRound += 1
  ja.endConfirmDeadline = daysFromNow(3)
  ja.version += 1
  return ok()
}

export function submitJointEndConfirm(jointId: string, clubId: string, actorName: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.status !== 'closing_confirm') return err('当前不在结束确认阶段')
  if (ja.endConfirmations[clubId]) return err('该社团已提交结束确认')
  ja.endConfirmRound += 1
  ja.endConfirmDeadline = daysFromNow(3)
  ja.endConfirmations[clubId] = actorName
  const allEnd = ja.clubs.every((c) => ja.endConfirmations[c.clubId])
  if (!allEnd) {
    ja.version += 1
    return ok()
  }
  const t = assertTransition('SM-JNT-001', ja.status, 'closed', 'confirm_all')
  if (!t.ok) return err(t.reason || '当前状态不可完成结束确认')
  ja.status = 'closed'
  ja.closedAt = now()
  ja.channelStatus = 'closed'
  for (const it of jointInterviews) {
    if (it.jointId === ja.id && it.status === 'completed') it.status = 'completed_archived'
  }
  for (const con of jointConclusions) {
    // SM-JNT-005：evaluating/invite_pending→archived（activity_final）；accepted_locked 保持锁定
    if (con.jointId === ja.id && con.status !== 'accepted_locked') {
      const mv = moveJointConclusion(con, 'activity_final', 'archived')
      if (!mv.ok) return err(mv.reason || '结论状态不可归档')
    }
  }
  expireActivityTasks(jointId)
  ja.version += 1
  return ok()
}

export function forceCloseJointActivity(jointId: string, reason: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-001', ja.status, 'force_closed', 'force_close')
  if (!t.ok) return err(t.reason || '当前状态不可强制结束')
  if (!reason.trim()) return err('必须填写强制结束原因')
  ja.status = 'force_closed'
  ja.forceClosedAt = now()
  ja.channelStatus = 'closed'
  for (const inv of jointInvitations) {
    if (inv.jointId === ja.id && inv.status === 'pending_acceptance') {
      inv.status = 'expired'
      inv.reviewFlag = false
    }
  }
  for (const it of jointInterviews) {
    if (it.jointId === ja.id && ['pending_selection', 'scheduled', 'in_progress'].includes(it.status)) {
      it.status = 'cancelled_archived'
      // 仅当面试仍持有 slot 引用时释放容量，并同步清空引用（与 markJointAttendance 约定一致）
      if (it.slotId) {
        const slot = jointSlots.find((s) => s.id === it.slotId && s.jointId === ja.id)
        if (slot) slot.taken = Math.max(0, slot.taken - 1)
        it.slotId = null
        it.startAt = null
        it.endAt = null
      }
    }
  }
  for (const con of jointConclusions) {
    // SM-JNT-005：evaluating/invite_pending→archived（activity_final 或 force_invalidated）；accepted_locked 保持锁定
    if (con.jointId === ja.id && con.status !== 'accepted_locked') {
      const event = con.status === 'invite_pending' ? 'force_invalidated' : 'activity_final'
      const mv = moveJointConclusion(con, event, 'archived')
      if (!mv.ok) return err(mv.reason || '结论状态不可归档')
      con.reviewFlag = false
    }
  }
  expireActivityTasks(jointId)
  ja.version += 1
  return ok()
}

export function forceSuspendJointClub(jointId: string, clubId: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const club = ja.clubs.find((c) => c.clubId === clubId)
  if (!club) return err('该社团不是参与社团')
  const t = assertTransition('SM-JNT-002', club.status, 'force_suspended', 'force_suspend')
  if (!t.ok) return err(t.reason || '该社团当前不可紧急停用')
  club.status = 'force_suspended'
  club.suspendedSince = now()
  ja.version += 1
  return ok()
}

export function reEnableJointClub(jointId: string, clubId: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  const club = ja?.clubs.find((c) => c.clubId === clubId)
  if (!club) return err('该社团不是参与社团')
  const t = assertTransition('SM-JNT-002', club.status, 'locked', 're_enable')
  if (!t.ok) return err(t.reason || '该社团当前不可恢复')
  club.status = 'locked'
  club.suspendedSince = null
  ja!.version += 1
  return ok()
}

// ================= 面试官任务模型（ORG-037 / REC-013 / JNT-031） =================

export interface InterviewerTask {
  id: string
  clubId: string
  activityId: string
  kind: 'recruitment' | 'joint'
  scope: 'activity' | 'round'
  roundId: string | null
  userId: string
  userName: string
  status: 'active' | 'revoked' | 'expired'
  createdAt: string
  revokedAt: string | null
  revokedBy: string | null
}

export const interviewerTasks: InterviewerTask[] = []

let interviewerTaskSeq = 1

/**
 * 测试隔离（MRM-013）：清空运行时累加的面试官任务并还原序号。
 * interviewerTasks / interviewerTaskSeq / autoProfileSeq 均为模块级可变状态，
 * 此前 resetRecruitmentDB 只按种子还原业务数组，任务列表与自增序列跨用例残留，
 * 中断写入用例后重跑会导致断言残留（任务数、id 膨胀）。
 * 数据数组（recruitmentActivities 等）由 reset.ts 按种子统一还原，此处只负责无种子的运行时状态。
 */
export function resetRecruitmentState(): void {
  interviewerTasks.splice(0, interviewerTasks.length)
  interviewerTaskSeq = 1
  autoProfileSeq = 0
}

/** 指派临时面试官（ORG-037：仅本社团当前成员；活动级覆盖全部轮次，轮次级只覆盖指定轮次） */
export function assignInterviewerTask(input: {
  clubId: string
  activityId: string
  kind: 'recruitment' | 'joint'
  scope: 'activity' | 'round'
  roundId?: string
  userId: string
  userName: string
}): { ok: boolean; error?: string; data?: InterviewerTask } {
  if (input.scope === 'round') {
    if (!input.roundId) return err('轮次级任务必须指定轮次')
    if (input.kind === 'recruitment') {
      const act = recruitmentActivities.find((a) => a.id === input.activityId)
      const roundOk = act ? act.rounds.some((r) => r.id === input.roundId) : false
      if (!roundOk) return err('指定轮次不存在')
    }
  }
  const activeTasks = interviewerTasks.filter(
    (t) => t.clubId === input.clubId && t.activityId === input.activityId && t.userId === input.userId && t.status === 'active',
  )
  if (activeTasks.some((t) => t.scope === 'activity')) {
    return err('该成员已存在活动级面试任务（覆盖全部轮次），无需重复指派')
  }
  if (input.scope === 'round' && activeTasks.some((t) => t.roundId === input.roundId)) {
    return err('该轮次已存在有效面试任务，请先撤销')
  }
  const task: InterviewerTask = {
    id: `itask-${interviewerTaskSeq++}`,
    clubId: input.clubId, activityId: input.activityId, kind: input.kind,
    scope: input.scope, roundId: input.roundId || null,
    userId: input.userId, userName: input.userName,
    status: 'active', createdAt: now(), revokedAt: null, revokedBy: null,
  }
  interviewerTasks.push(task)
  return ok(task)
}

/** 撤销临时面试官任务（ORG-037：任务撤销立即失效） */
export function revokeInterviewerTask(taskId: string, byName: string): { ok: boolean; error?: string; data?: InterviewerTask } {
  const task = interviewerTasks.find((t) => t.id === taskId)
  if (!task) return err('任务不存在')
  if (task.status !== 'active') return err('任务已失效，无需撤销')
  task.status = 'revoked'
  task.revokedAt = now()
  task.revokedBy = byName
  return ok(task)
}

/** 轮次关闭 → 该轮全部轮次级任务立即失效（REC-013：轮次关闭后临时赋职失效） */
export function expireRoundTasks(activityId: string, roundId: string): void {
  for (const t of interviewerTasks) {
    if (t.activityId === activityId && t.roundId === roundId && t.status === 'active') t.status = 'expired'
  }
}

/** 活动/批次结束 → 全部任务立即失效（REC-013/JNT-031：活动结束对应临时赋职失效） */
export function expireActivityTasks(activityId: string): void {
  for (const t of interviewerTasks) {
    if (t.activityId === activityId && t.status === 'active') t.status = 'expired'
  }
}

/** 用户在指定活动内的有效任务 */
export function activeTasksOfActivity(userId: string, activityId: string): InterviewerTask[] {
  return interviewerTasks.filter((t) => t.userId === userId && t.activityId === activityId && t.status === 'active')
}

/** 指定活动的全部任务（管理列表） */
export function tasksOfActivity(activityId: string, clubId?: string): InterviewerTask[] {
  return interviewerTasks.filter((t) => t.activityId === activityId && (!clubId || t.clubId === clubId))
}
