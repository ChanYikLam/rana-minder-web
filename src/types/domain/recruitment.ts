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

/** 与 SM-REC-001 状态词表一致（来源：state-machines/transitions.ts） */
export type RecruitmentActivityStatus =
  | 'draft'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'force_completed'
  | 'archived'

/** 与 SM-REC-002 状态词表一致 */
export type RecruitmentChannelStatus = 'not_open' | 'open' | 'paused' | 'closed'

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

/** 与 SM-REC-003 申请与修订状态词表一致 */
export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'revision_requested'
  | 'revised'
  | 'exited'
  | 'adjustment_overdue'
  | 'identity_anomaly'
  | 'not_qualified'
  | 'accepted'

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

/** 与 SM-REC-005 面试记录状态词表一致 */
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

/** 与 SM-INV-001 邀请状态词表一致 */
export type InvitationStatus =
  | 'draft'
  | 'pending_acceptance'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'expired'
  | 'effective'
  | 'sync_failed'
