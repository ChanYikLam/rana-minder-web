/** 申请状态 → 用户可读文案（未知状态回退原文；普通招新与联合报名共用）
 * 文案与全局词表 src/components/business/stateLabels.ts 保持一致（submitted=已提交），
 * 避免同一状态在两套映射中展示不一致。 */
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  submitted: '已提交',
  archived: '已归档',
  revision_requested: '需修订',
  exited: '已退出',
  adjustment_overdue: '调整超期',
  identity_anomaly: '身份异常',
  not_qualified: '资格失效',
  accepted: '已接受',
}

export function applicationStatusLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status] || status
}

/** 申请状态视图：恢复窗口仅普通招新的 exited 申请存在（mock 契约 recoveryWindowDeadline） */
export interface ApplicationStatusView {
  status: string
  recoveryWindowDeadline?: string | null
}

/** exited 恢复窗口是否仍在有效期内 */
export function isRecoveryWindowActive(app: ApplicationStatusView): boolean {
  if (app.status !== 'exited') return false
  const deadline = app.recoveryWindowDeadline
  if (!deadline) return false
  return new Date(deadline).getTime() > Date.now()
}

/**
 * 当前状态是否允许编辑并提交/保存草稿（两页共用，避免各自演化分叉）：
 * - 无申请记录：可正常填写提交
 * - draft / revision_requested：可编辑
 * - exited：恢复窗口未过期时可编辑并重新提交（SM-REC-003 recovery_resubmit → submitted）
 * - 其余状态（submitted / archived / adjustment_overdue / identity_anomaly / not_qualified / accepted 等）不可编辑
 */
export function isEditableStatus(app: ApplicationStatusView | null | undefined): boolean {
  if (!app) return true
  if (app.status === 'draft' || app.status === 'revision_requested') return true
  if (app.status === 'exited') return isRecoveryWindowActive(app)
  return false
}

/** 终态状态 → 不可操作原因说明（用户侧可解释文案） */
export const TERMINAL_STATUS_HINTS: Record<string, string> = {
  exited: '已退出招新，恢复窗口未开放或已过期，无法自行重新提交；如需恢复报名请联系管理员创建恢复窗口',
  adjustment_overdue: '调整逾期，请联系管理员延长窗口或处理',
  accepted: '已接受录取，该申请流程已结束，不能再编辑或提交',
  not_qualified: '资格失效，该申请流程已结束，不能再编辑或提交',
}

export function terminalStatusHint(status: string): string {
  return TERMINAL_STATUS_HINTS[status] || '该状态下不可编辑或提交报名'
}
