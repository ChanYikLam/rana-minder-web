/**
 * Mock 有状态库：普通招新（REC）+ 多社团联合（JNT）+ 邀请（INV）
 * 状态流转经 state-machines/transitions.ts 校验；业务前置条件在此层守卫
 */
import { assertTransition } from './state-machines/transitions'
import { mockUsers } from './auth'

/** 申请人档案（applicantId → 姓名/学号）：申请人 id 为 u-xxx 域内编号，
 * 与 auth.mockUsers 的 user-applicant-xxx 键不同，按申请人域自维护 */
const APPLICANT_PROFILES: Record<string, { name: string; studentId: string }> = {
  'u-001': { name: '刘子豪', studentId: '20240001' },
  'u-002': { name: '陈雨桐', studentId: '20240002' },
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

export type RecActivityStatus = 'draft' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'force_completed' | 'archived'
export type ChannelStatus = 'not_open' | 'open' | 'paused' | 'closed'
export type ApplicationStatus = 'draft' | 'submitted' | 'revision_requested' | 'exited' | 'adjustment_overdue' | 'identity_anomaly' | 'not_qualified' | 'accepted'
export type DeptPathStatus = 'pending' | 'evaluating' | 'hold' | 'decided' | 'waitlist' | 'published'
export type InterviewStatus = 'pending_selection' | 'scheduled' | 'leave' | 'late' | 'absent' | 'in_progress' | 'completed' | 'cancelled' | 'invalidated'
export type RecInvitationStatus = 'pending_acceptance' | 'accepted' | 'rejected' | 'withdrawn' | 'expired'

export interface RecDeptPath {
  departmentId: string
  departmentName: string
  order: number
  source: 'volunteer' | 'adjustment'
  status: DeptPathStatus
  decided: 'admit' | 'not_admit' | null
  labelSetBy: string | null
  waitlist: boolean
  holdDeadline: string | null
  publishedAt: string | null
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

export type JointStatus = 'draft' | 'confirmed' | 'published' | 'invite_phase' | 'closing_confirm' | 'closed' | 'cancelled' | 'force_closed'
export type JointClubStatus = 'invited' | 'accepted' | 'confirm_pending' | 'locked' | 'force_suspended'
export type JointApplicationStatus = 'draft' | 'submitted' | 'archived'
export type JointInterviewStatus = 'pending_selection' | 'scheduled' | 'leave' | 'late' | 'absent' | 'in_progress' | 'completed' | 'invalidated' | 'cancelled_archived' | 'completed_archived'
export type JointConclusionStatus = 'pending' | 'evaluating' | 'invite_pending' | 'accepted_locked' | 'archived'
export type JointInvitationStatus = 'pending_acceptance' | 'accepted' | 'rejected' | 'withdrawn' | 'expired'

export interface JointClub {
  clubId: string
  clubName: string
  status: JointClubStatus
  confirmedAt: string | null
  confirmedBy: string | null
  suspendedSince: string | null
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
      'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },
      'dept-003': { departmentId: 'dept-003', departmentName: '设计部', order: 2, source: 'volunteer', status: 'pending', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },
    },
    submittedAt: daysFromNow(-31), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null,
    version: 1,
  },
  {
    id: 'app-002', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-002', applicantName: '陈雨桐', studentId: '20240002',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }],
    allowAdjustment: true, formVersion: 1, answers: {},
    paths: {
      'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },
    },
    submittedAt: daysFromNow(-31), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null,
    version: 1,
  },
  {
    id: 'app-003', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-003', applicantName: '王梓涵', studentId: '20240003',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-001', departmentName: '技术部' }],
    allowAdjustment: false, formVersion: 1, answers: {},
    paths: {
      'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'waitlist', decided: null, labelSetBy: '李思颖', waitlist: true, holdDeadline: null, publishedAt: null, version: 2 },
    },
    submittedAt: daysFromNow(-32), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null,
    version: 1,
  },
  {
    id: 'app-004', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-004', applicantName: '张博文', studentId: '20240004',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }],
    allowAdjustment: false, formVersion: 1, answers: {},
    paths: {
      'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'published', decided: 'not_admit', labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: daysFromNow(-28), version: 2 },
    },
    submittedAt: daysFromNow(-32), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null,
    version: 1,
  },
  {
    id: 'app-005', activityId: 'act-001', clubId: 'club-001',
    applicantId: 'u-005', applicantName: '李欣怡', studentId: '20240005',
    status: 'submitted',
    preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }],
    allowAdjustment: true, formVersion: 1, answers: {},
    paths: {
      'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },
    },
    submittedAt: daysFromNow(-32), withdrawnAt: null, recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null,
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
    applicantId: 'u-002', applicantName: '陈雨桐', roundId: 'rd-001',
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
    applicantId: 'u-002', applicantName: '陈雨桐',
    departmentId: 'dept-001', departmentName: '技术部',
    status: 'pending_acceptance', sentAt: daysFromNow(-22), expiredAt: daysFromNow(5),
    acceptedAt: null, casdoorSync: 'none', version: 1,
  },
]

export const jointActivities: JointActivity[] = [
  {
    id: 'jnt-001', title: '2025 计算机与电子设计联合招新', description: '两个协会联合开展的新生招新面试',
    status: 'published',
    clubs: [
      { clubId: 'club-001', clubName: '计算机协会', status: 'locked', confirmedAt: daysFromNow(-27), confirmedBy: '张明远', suspendedSince: null },
      { clubId: 'club-002', clubName: '电子设计协会', status: 'locked', confirmedAt: daysFromNow(-27), confirmedBy: '林晓峰', suspendedSince: null },
    ],
    confirmRound: 1, confirmDeadline: daysFromNow(10),
    sharedAgreement: { version: 1, text: '您的报名资料将在两个参与社团之间共享，用于联合面试与选拔。您可以在提交前选择是否同意共享；拒绝共享则不能参加本次联合活动。' },
    formId: 'form-001', formVersion: 1,
    channelStatus: 'open', channelPausedBefore: null, pauseStartAt: null,
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
    agreementVersion: 1, allowJointAdjustment: true, volunteerClubIds: ['club-001', 'club-002'], agreementClubSnapshot: ['计算机协会', '电子设计协会'],
    answers: {}, formVersion: 1,
    submittedAt: daysFromNow(-25), version: 1,
  },
  {
    id: 'japp-002', jointId: 'jnt-001', applicantId: 'u-001', applicantName: '刘子豪', studentId: '20240001',
    status: 'draft', consented: false, consentAt: null,
    agreementVersion: 1, allowJointAdjustment: false, volunteerClubIds: [], agreementClubSnapshot: [],
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

export function saveApplicationDraft(activityId: string, applicantId: string, input: { answers?: Record<string, unknown> }): { ok: boolean; error?: string; data?: RecApplication } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  let app = findApplication(activityId, applicantId)
  if (!app) {
    app = {
      id: 'app-' + Date.now(), activityId, clubId: a.clubId, applicantId, applicantName: applicantNameOf(applicantId), studentId: applicantStudentIdOf(applicantId),
      status: 'draft', preferences: [], allowAdjustment: a.allowAdjustmentDefault, formVersion: a.formVersion,
      answers: input.answers || {}, paths: {}, submittedAt: null, withdrawnAt: null,
      recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, version: 1,
    }
    if (!a.applicantIds.includes(app.id)) a.applicantIds.push(app.id)
    recruitmentApplications.push(app)
  } else if (app.status === 'submitted') {
    const t = assertTransition('SM-REC-003', 'submitted', 'draft', 'edit_before_deadline')
    if (!t.ok) return err(t.reason || '已提交申请当前不可编辑')
    app.status = 'draft'
  }
  app.answers = { ...app.answers, ...(input.answers || {}) }
  app.version += 1
  return ok(app)
}

export function submitApplication(activityId: string, applicantId: string, input: { preferences: { departmentId: string }[]; allowAdjustment: boolean; answers?: Record<string, unknown> }): { ok: boolean; error?: string; data?: RecApplication } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status !== 'in_progress') return err('活动当前不可报名')
  const existing = findApplication(activityId, applicantId)
  const inAdjustment = !!existing?.adjustmentDeadline && new Date(existing.adjustmentDeadline).getTime() >= Date.now()
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
      status: 'draft', preferences: [], allowAdjustment: input.allowAdjustment, formVersion: a.formVersion,
      answers: input.answers || {}, paths: {}, submittedAt: null, withdrawnAt: null,
      recoveryWindowDeadline: null, adjustmentDeadline: null, adjustmentReason: null, notQualifiedReason: null, identityAnomalyAt: null, version: 1,
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
  } else if (app.status === 'submitted') {
    okResult = assertTransition('SM-REC-003', 'submitted', 'draft', 'edit_before_deadline')
    if (okResult.ok) {
      okResult = assertTransition('SM-REC-003', 'draft', 'submitted', 'submit')
    }
  } else {
    okResult = assertTransition('SM-REC-003', app.status, 'submitted', 'submit')
  }
  if (!okResult.ok) return err(okResult.reason || '当前申请状态不可提交')
  app.status = 'submitted'
  app.preferences = input.preferences.map((p, i) => {
    const d = a.departments.find((x) => x.id === p.departmentId)!
    return { order: i + 1, departmentId: d.id, departmentName: d.name }
  })
  app.allowAdjustment = input.allowAdjustment
  app.answers = { ...(input.answers || {}) }
  app.formVersion = a.formVersion
  app.submittedAt = now()
  app.withdrawnAt = null
  app.recoveryWindowDeadline = null
  app.adjustmentDeadline = null
  app.adjustmentReason = null
  app.notQualifiedReason = null
  app.version += 1
  for (const p of app.preferences) {
    if (!app.paths[p.departmentId]) {
      app.paths[p.departmentId] = { departmentId: p.departmentId, departmentName: p.departmentName, order: p.order, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 }
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
  for (const it of recruitmentInterviews) {
    if (it.applicantId === applicantId && it.activityId === activityId && ['pending_selection', 'scheduled', 'leave', 'late', 'absent'].includes(it.status)) {
      it.status = 'cancelled'
      it.cancelReason = '申请人退出招新'
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
  for (const it of recruitmentInterviews) {
    if (it.applicantId === applicantId && it.activityId === activityId && ['pending_selection', 'scheduled'].includes(it.status)) {
      it.status = 'cancelled'
      it.cancelReason = '资格失效'
    }
  }
  app.version += 1
  return ok()
}

// ================= REC 评价/路径/结论 =================

export function setDeptLabel(activityId: string, applicantId: string, departmentId: string, label: boolean, actorId: string, actorName: string, actorRole: string, isDeptLeader: boolean, actorUserId?: string | null): { ok: boolean; error?: string } {
  void actorRole
  void actorId
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const path = app.paths[departmentId]
  if (!path) return err('该申请没有此部门路径')
  if (isDeptLeader && path.source !== 'volunteer') return err('部门负责人仅能操作正式报名本部门的申请人')
  const vol = app.preferences.find((p) => p.departmentId === departmentId)
  if (isDeptLeader && !vol) return err('部门负责人仅能为正式报名本部门的申请人设置标签')
  if (isDeptLeader && actorUserId && actorUserId === app.applicantId) return err('不能设置自己的标签')
  if (label) {
    path.status = 'decided'
    path.decided = 'admit'
    path.labelSetBy = actorName
  } else {
    path.decided = null
    path.labelSetBy = null
    if (path.waitlist) path.status = 'waitlist'
    else path.status = 'evaluating'
  }
  path.version += 1
  app.version += 1
  return ok()
}

export function decidePath(activityId: string, applicantId: string, departmentId: string, decision: 'admit' | 'not_admit' | 'hold', holdDeadline?: string): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const path = app.paths[departmentId]
  if (!path) return err('路径不存在')
  if (decision === 'hold') {
    if (!holdDeadline) return err('暂缓必须设置处理期限')
    path.status = 'hold'
    path.holdDeadline = holdDeadline
  } else if (decision === 'admit') {
    if (path.status === 'waitlist') path.status = 'published'
    else path.status = 'decided'
    path.decided = 'admit'
  } else {
    path.decided = 'not_admit'
    path.status = 'published'
    path.publishedAt = now()
  }
  path.version += 1
  app.version += 1
  return ok()
}

export function setWaitlist(activityId: string, applicantId: string, departmentId: string, on: boolean): { ok: boolean; error?: string } {
  const app = findApplication(activityId, applicantId)
  if (!app) return err('申请不存在')
  const path = app.paths[departmentId]
  if (!path) return err('路径不存在')
  if (on) {
    path.status = 'waitlist'
    path.waitlist = true
  } else {
    path.waitlist = false
    if (path.decided === 'admit') path.status = 'decided'
    else path.status = 'evaluating'
  }
  path.version += 1
  app.version += 1
  return ok()
}

export function submitReview(activityId: string, applicantId: string, input: { comment: string; rating: number; authorId: string; authorName: string; authorRole: string; roundId?: string | null }): { ok: boolean; error?: string; data?: RecReview } {
  const a = findAnyActivity(activityId)
  if (!a) return err('活动不存在')
  if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'force_completed') return err('活动已结束，普通评价编辑已锁定')
  if (input.roundId) {
    const round = a.rounds.find((r) => r.id === input.roundId)
    if (round && (round.status === 'closed' || round.status === 'cancelled')) return err('该轮次已关闭，评价已锁定；如需修改请走事实纠错')
  }
  let rev = recruitmentReviews.find((r) => r.activityId === activityId && r.applicantId === applicantId && r.authorId === input.authorId)
  if (rev) {
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
  if (inv.status !== 'accepted') return err('仅已接受的邀请可执行成员同步确认')
  if (inv.casdoorSync === 'processing') {
    inv.casdoorSync = 'confirmed'
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
  const clubNames: Record<string, string> = { 'club-001': '计算机协会', 'club-002': '电子设计协会', 'club-003': '羽毛球协会' }
  const ja: JointActivity = {
    id: 'jnt-' + Date.now(), title: input.title, description: input.description || '',
    status: 'draft',
    clubs: input.clubIds.map((cid) => ({
      clubId: cid, clubName: clubNames[cid] || (cid === clubId ? clubName : cid),
      status: cid === clubId ? 'accepted' : 'invited',
      confirmedAt: cid === clubId ? now() : null,
      confirmedBy: cid === clubId ? actorName : null,
      suspendedSince: null,
    })),
    confirmRound: 1, confirmDeadline: input.confirmDeadline,
    sharedAgreement: { version: 1, text: input.sharedAgreement || '您的报名资料将在全部参与社团之间共享，用于联合面试与选拔。' },
    formId: 'form-001', formVersion: 1,
    channelStatus: 'not_open', channelPausedBefore: null, pauseStartAt: null,
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
    return old ? { ...old, status: old.status === 'accepted' ? 'confirm_pending' : old.status, confirmedAt: old.status === 'accepted' ? null : old.confirmedAt, confirmedBy: old.status === 'accepted' ? null : old.confirmedBy } : { clubId: cid, clubName: cid, status: 'invited', confirmedAt: null, confirmedBy: null, suspendedSince: null }
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
  ja.clubs.forEach((c) => (c.status = 'locked'))
  ja.version += 1
  return ok()
}

export function saveJointApplicationDraft(jointId: string, applicantId: string, applicantName: string, studentId: string): { ok: boolean; error?: string; data?: JointApplication } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  if (ja.status === 'draft' || ja.status === 'confirmed') return err('联合活动尚未首次公布')
  let app = findJointApplication(jointId, applicantId)
  if (!app) {
    app = {
      id: 'japp-' + Date.now(), jointId, applicantId, applicantName, studentId,
      status: 'draft', consented: false, consentAt: null, agreementVersion: null,
      allowJointAdjustment: true, volunteerClubIds: [], agreementClubSnapshot: [], answers: {}, formVersion: ja.formVersion, submittedAt: null, version: 1,
    }
    jointApplications.push(app)
    ja.applicantIds.push(app.id)
  }
  return ok(app)
}

export function submitJointApplication(jointId: string, applicantId: string, input: { consented: boolean; allowJointAdjustment: boolean; volunteerClubIds?: string[]; answers?: Record<string, unknown> }): { ok: boolean; error?: string; data?: JointApplication } {
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
  app.volunteerClubIds = input.volunteerClubIds && input.volunteerClubIds.length > 0
    ? availableClubIds.filter((id) => input.volunteerClubIds!.includes(id))
    : availableClubIds
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
  const event = it.status === 'scheduled' ? 'reschedule' : it.status === 'invalidated' ? 'rearrange' : 'select'
  const t = assertTransition('SM-JNT-004', fromStatus, 'scheduled', event)
  if (!t.ok) return err(t.reason || '当前面试记录不可预约')
  const conflict = applicantTimeConflict(applicantId, slot.startAt, slot.endAt, it.id)
  if (conflict.conflict) return err(conflict.detail || '该时段与既有安排冲突')
  if (it.status === 'invalidated' && it.slotId && it.slotId !== slot.id) {
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
      jointInvitations.unshift(inv)
      con.inviteId = inv.id
    } else {
      con.inviteId = null
    }
    con.reviewFlag = false
  }
  con.version += 1
  return ok()
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
  const t = assertTransition('SM-JNT-005', con.status, 'evaluating', 'modify')
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
    con.inviteId = inv.id
    con.status = 'invite_pending'
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
      con.reviewFlag = false
      con.inviteId = null
      con.status = 'evaluating'
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
      con.inviteId = null
      con.status = 'evaluating'
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
      con.status = 'accepted_locked'
      con.conclusion = 'admit'
      con.reviewFlag = false
      con.version += 1
    }
  } else {
    const con = jointConclusions.find((c) => c.inviteId === inv.id)
    if (con) {
      con.inviteId = null
      con.status = 'evaluating'
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
    con.inviteId = null
    con.status = 'evaluating'
    con.version += 1
  }
  inv.version += 1
  return ok()
}

export function confirmJointInvitationSync(invitationId: string): { ok: boolean; error?: string } {
  const inv = findJointInvitation(invitationId)
  if (!inv) return err('邀请不存在')
  if (inv.status === 'accepted' && inv.casdoorSync === 'processing') {
    inv.casdoorSync = 'confirmed'
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
  ja.version += 1
  return ok()
}

export function pauseJointChannel(jointId: string): { ok: boolean; error?: string } {
  const ja = findJoint(jointId)
  if (!ja) return err('联合活动不存在')
  const t = assertTransition('SM-JNT-006', ja.channelStatus, 'paused', 'pause')
  if (!t.ok) return err(t.reason || '联合报名通道当前不可暂停')
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
  ja.channelStatus = 'open'
  ja.deadlineVersion += 1
  ja.window = { seq: ja.window.seq + 1, deadline: newDeadline }
  ja.deadline = newDeadline
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
      }
    }
    expireActivityTasks(jointId)
  }
  ja.version += 1
  return ok()
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
    if (con.jointId === ja.id && con.status !== 'accepted_locked') con.status = 'archived'
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
    }
  }
  for (const con of jointConclusions) {
    if (con.jointId === ja.id && con.status !== 'accepted_locked') {
      con.status = 'archived'
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
  const duplicate = interviewerTasks.find(
    (t) => t.clubId === input.clubId && t.activityId === input.activityId && t.userId === input.userId && t.status === 'active',
  )
  if (duplicate) return err('该成员已存在有效面试任务，请先撤销')
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
