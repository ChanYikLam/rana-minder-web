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

export type RecruitmentActivityStatus = 'draft' | 'configuring' | 'pending_publish' | 'published' | 'paused' | 'closed' | 'archived'
export type RecruitmentChannelStatus = 'closed' | 'opening' | 'open' | 'paused' | 'closing' | 'closed_final'

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

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'revision_requested' | 'revised' | 'withdrawn' | 'rejected' | 'accepted'

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

export type InterviewStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled'

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

export type InvitationStatus = 'draft' | 'sent' | 'pending_acceptance' | 'accepted' | 'rejected' | 'withdrawn' | 'expired' | 'pending_casdoor_sync' | 'effective' | 'failed'
