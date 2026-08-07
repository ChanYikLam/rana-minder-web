import { recruitmentActivities, recruitmentApplications, recruitmentInterviews, recruitmentReviews, recruitmentInvitations, jointActivities, jointApplications, jointInterviews, jointConclusions, jointInvitations, jointSlots, jointReviewExtras, APPLICANT_PROFILES } from './db-recruitment'
import { departments, candidates, members, departmentApplications, membershipInvitations, appointmentCommands, resignationRequests, transitionState } from './db'
import { sysNotifications, setNotificationSeq, notificationSeqBase } from './notifications'
import { correctionsDb } from './db-corrections'
import { resetForms } from './db-forms'

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
  transitionState: structuredClone(transitionState),
  sysNotifications: structuredClone(sysNotifications),
  notificationSeq: notificationSeqBase,
  correctionsDb: structuredClone(correctionsDb),
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
  Object.keys(APPLICANT_PROFILES).forEach((k) => { if (k.startsWith('u-auto-')) delete APPLICANT_PROFILES[k] })
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
  Object.assign(transitionState, structuredClone(seed.transitionState))
}

export function resetNotifications(): void {
  sysNotifications.splice(0, sysNotifications.length, ...structuredClone(seed.sysNotifications))
  setNotificationSeq(seed.notificationSeq)
}

export function resetCorrections(): void {
  correctionsDb.splice(0, correctionsDb.length, ...structuredClone(seed.correctionsDb))
}
