import { recruitmentActivities, recruitmentApplications, recruitmentInterviews, recruitmentReviews, recruitmentInvitations, jointActivities, jointApplications, jointInterviews, jointConclusions, jointInvitations, jointSlots, jointReviewExtras, APPLICANT_PROFILES, resetRecruitmentState } from './db-recruitment'
import { departments, candidates, members, departmentApplications, membershipInvitations, appointmentCommands, resignationRequests, exitRequests, transitionState } from './db'
import { sysNotifications, setNotificationSeq, notificationSeqBase, notificationKillSwitch, killSwitchInitial, setNotificationKillSwitch, resetNotificationDedup, resetNotificationPreferences, resetEmailOutbox, resetEmailConfigs, resetClubKillSwitches } from './notifications'
import { correctionsDb } from './db-corrections'
import { auditLogsDb, setAuditLogSeq, type AuditLogEntry } from './db-audit'
import { resetGovernanceState } from './governance'
export { resetOrgDb } from './db-organization'
import { resetForms } from './db-forms'
// P2-017：平台共享状态（导出任务含 processing / platformConfig 版本 / 异常序号）纳入统一重置；
// 函数定义在 index.ts（持有导出任务与配置内存态），此处仅透传，避免用例间串扰。
export { resetSharedState } from './index'

const seed = {
  recruitmentActivities: structuredClone(recruitmentActivities),
  recruitmentApplications: structuredClone(recruitmentApplications),
  recruitmentInterviews: structuredClone(recruitmentInterviews),
  recruitmentReviews: structuredClone(recruitmentReviews),
  recruitmentInvitations: structuredClone(recruitmentInvitations),
  jointActivities: structuredClone(jointActivities),
  jointApplications: structuredClone(jointApplications),
  jointInterviews: structuredClone(jointInterviews),
  jointConclusions: structuredClone(jointConclusions),
  jointInvitations: structuredClone(jointInvitations),
  jointSlots: structuredClone(jointSlots),
  jointReviewExtras: structuredClone(jointReviewExtras),
  departments: structuredClone(departments),
  candidates: structuredClone(candidates),
  members: structuredClone(members),
  departmentApplications: structuredClone(departmentApplications),
  membershipInvitations: structuredClone(membershipInvitations),
  appointmentCommands: structuredClone(appointmentCommands),
  resignationRequests: structuredClone(resignationRequests),
  exitRequests: structuredClone(exitRequests),
  transitionState: structuredClone(transitionState),
  sysNotifications: structuredClone(sysNotifications),
  notificationSeq: notificationSeqBase,
  correctionsDb: structuredClone(correctionsDb),
  auditLogsDb: structuredClone(auditLogsDb) as AuditLogEntry[],
  applicantProfiles: structuredClone(APPLICANT_PROFILES),
} as const

export function resetRecruitmentDB(): void {
  recruitmentActivities.splice(0, recruitmentActivities.length, ...structuredClone(seed.recruitmentActivities))
  recruitmentApplications.splice(0, recruitmentApplications.length, ...structuredClone(seed.recruitmentApplications))
  recruitmentInterviews.splice(0, recruitmentInterviews.length, ...structuredClone(seed.recruitmentInterviews))
  recruitmentReviews.splice(0, recruitmentReviews.length, ...structuredClone(seed.recruitmentReviews))
  recruitmentInvitations.splice(0, recruitmentInvitations.length, ...structuredClone(seed.recruitmentInvitations))
  jointActivities.splice(0, jointActivities.length, ...structuredClone(seed.jointActivities))
  jointApplications.splice(0, jointApplications.length, ...structuredClone(seed.jointApplications))
  jointInterviews.splice(0, jointInterviews.length, ...structuredClone(seed.jointInterviews))
  jointConclusions.splice(0, jointConclusions.length, ...structuredClone(seed.jointConclusions))
  jointInvitations.splice(0, jointInvitations.length, ...structuredClone(seed.jointInvitations))
  jointSlots.splice(0, jointSlots.length, ...structuredClone(seed.jointSlots))
  jointReviewExtras.splice(0, jointReviewExtras.length, ...structuredClone(seed.jointReviewExtras))
  // MRM-013：整体还原申请人档案种子（清除 u-auto-* 动态注册并恢复种子内容），消除 seed.applicantProfiles 死代码
  Object.keys(APPLICANT_PROFILES).forEach((k) => { delete APPLICANT_PROFILES[k] })
  Object.assign(APPLICANT_PROFILES, structuredClone(seed.applicantProfiles))
  // MRM-013：清空运行时累加的面试官任务并还原序号（interviewerTasks / interviewerTaskSeq / autoProfileSeq）
  resetRecruitmentState()
  resetForms()
}

export function resetDb(): void {
  departments.splice(0, departments.length, ...structuredClone(seed.departments))
  candidates.splice(0, candidates.length, ...structuredClone(seed.candidates))
  members.splice(0, members.length, ...structuredClone(seed.members))
  departmentApplications.splice(0, departmentApplications.length, ...structuredClone(seed.departmentApplications))
  membershipInvitations.splice(0, membershipInvitations.length, ...structuredClone(seed.membershipInvitations))
  appointmentCommands.splice(0, appointmentCommands.length, ...structuredClone(seed.appointmentCommands))
  resignationRequests.splice(0, resignationRequests.length, ...structuredClone(seed.resignationRequests))
  exitRequests.splice(0, exitRequests.length, ...structuredClone(seed.exitRequests))
  Object.assign(transitionState, structuredClone(seed.transitionState))
}

export function resetNotifications(): void {
  sysNotifications.splice(0, sysNotifications.length, ...structuredClone(seed.sysNotifications))
  setNotificationSeq(seed.notificationSeq)
  // P1-009：重置紧急关闭、去重、偏好、邮件 outbox、SMTP 配置
  setNotificationKillSwitch({ active: false })
  Object.assign(notificationKillSwitch, structuredClone(killSwitchInitial))
  resetClubKillSwitches()
  resetNotificationDedup()
  resetNotificationPreferences()
  resetEmailOutbox()
  resetEmailConfigs()
}

export function resetCorrections(): void {
  correctionsDb.splice(0, correctionsDb.length, ...structuredClone(seed.correctionsDb))
}

export function resetAuditLogs(): void {
  auditLogsDb.splice(0, auditLogsDb.length, ...structuredClone(seed.auditLogsDb))
  setAuditLogSeq(1000)
}

/** P1-011：复位治理安全状态（异常访问事件/告警、真实数据开关、高风险命令 enforced 标志） */
export function resetGovernance(): void {
  resetGovernanceState()
}
