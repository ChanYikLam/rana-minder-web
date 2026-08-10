/** 领域模型类型 - 招新 */

export interface RecruitmentActivity {
  id: string
  clubId: string
  clubName: string
  title: string
  description: string
  status: RecruitmentActivityStatus
  channelStatus: RecruitmentChannelStatus
  deadline: string
  formId: string
  departments: Department[]
  createdAt: string
  updatedAt: string
}

/**
 * 与 SM-REC-001 转换表一致的状态子集（状态机源：state-machines/transitions.ts）。
 * 另含 mock 历史字段仍使用的显示别名 published；显示文案统一走 components/business/stateLabels.ts。
 */
export type RecruitmentActivityStatus =
  | 'draft'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'force_completed'
  | 'archived'
  /* 显示别名（历史 mock 字段） */
  | 'published'

/** 与 SM-REC-002 转换表一致；closed_final 为历史展示别名 */
export type RecruitmentChannelStatus =
  | 'not_open'
  | 'open'
  | 'paused'
  | 'closed'
  | 'closed_final'

export interface Department {
  id: string
  name: string
  parentId: string | null
}

export interface Application {
  id: string
  activityId: string
  applicantId: string
  applicantName: string
  applicantStudentId: string
  status: ApplicationStatus
  preferences: ApplicationPreference[]
  submittedAt: string | null
  withdrawnAt: string | null
  formVersion: number
}

/**
 * 与 SM-REC-003 转换表一致；under_review / withdrawn / rejected 为
 * 部门关系申请（SM-MEM-003）与历史 mock 字段使用的并集成员，
 * 统一在本类型内声明，避免三套词表漂移。
 */
export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'revision_requested'
  | 'exited'
  | 'adjustment_overdue'
  | 'identity_anomaly'
  | 'not_qualified'
  | 'accepted'
  /* SM-MEM-003 / 历史字段 */
  | 'under_review'
  | 'withdrawn'
  | 'rejected'

export interface ApplicationPreference {
  order: number
  departmentId: string
  departmentName: string
}

export interface Interview {
  id: string
  activityId: string
  applicantId: string
  applicantName: string
  status: InterviewStatus
  scheduledTime: string | null
  location: string | null
  interviewerIds: string[]
  interviewers: { id: string; name: string }[]
}

/** 与 SM-REC-005 转换表一致；rescheduled 为历史展示别名 */
export type InterviewStatus =
  | 'pending_selection'
  | 'scheduled'
  | 'leave'
  | 'late'
  | 'absent'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'invalidated'
  | 'rescheduled'

export interface Invitation {
  id: string
  activityId: string
  applicantId: string
  applicantName: string
  status: InvitationStatus
  sentAt: string | null
  acceptedAt: string | null
  expiredAt: string | null
}

/**
 * 与 SM-INV-001 转换表一致；pending_casdoor_sync 为历史展示别名。
 * 与成员邀请（SM-MEM-004）共用同一显示语义。
 */
export type InvitationStatus =
  | 'draft'
  | 'pending_acceptance'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'expired'
  | 'effective'
  | 'sync_failed'
  | 'pending_casdoor_sync'
