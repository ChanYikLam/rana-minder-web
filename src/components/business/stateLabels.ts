/**
 * 状态词表 · 显示层单一映射（StateTag 使用）。
 * 覆盖两套来源：
 *  - transitions.ts 中所有状态机的状态（SM-*），作为“新词表”；
 *  - mock 历史字段中仍使用的展示型状态（published / opening / closed_final / configuring 等），
 *    作为“显示别名”保留，避免渲染退化为原文英文。
 * 新增业务状态时，请同步在此补充映射；StateTag 不再需要单独维护。
 */

export type StatusVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'selected'

export interface StatusLabel {
  variant: StatusVariant
  label: string
}

export const STATE_LABELS: Record<string, StatusLabel> = {
  // ===== 通用 / 账号（SM-IDN-001）=====
  draft: { variant: 'neutral', label: '草稿' },
  published: { variant: 'info', label: '已发布' },
  archived: { variant: 'neutral', label: '已归档' },
  deprecated: { variant: 'neutral', label: '已废止' },
  anonymous: { variant: 'neutral', label: '未登录' },
  authenticating: { variant: 'info', label: '认证中' },
  authenticated: { variant: 'success', label: '已认证' },
  casdoor_unconfirmable: { variant: 'danger', label: '身份不可确认' },
  disabled: { variant: 'neutral', label: '已停用' },
  deleted: { variant: 'neutral', label: '已删除' },

  // ===== 资料 / 同步（SM-IDN-002/003）=====
  incomplete: { variant: 'warning', label: '未完善' },
  pending_email_verification: { variant: 'warning', label: '待邮箱验证' },
  complete: { variant: 'success', label: '已完成' },
  scope_restricted: { variant: 'warning', label: '范围受限' },
  synced: { variant: 'success', label: '已同步' },
  pending_sync: { variant: 'warning', label: '同步中' },
  retrying: { variant: 'warning', label: '重试中' },
  pending_readback: { variant: 'warning', label: '待回读' },
  conflict_pending: { variant: 'warning', label: '冲突待决' },
  rolled_back: { variant: 'danger', label: '已回滚' },
  sync_abnormal_ro: { variant: 'danger', label: '同步异常·只读' },

  // ===== 社团接入（SM-ORG-001）=====
  wizard_pending: { variant: 'info', label: '接入引导中' },
  pending_review: { variant: 'warning', label: '待审核' },
  emergency_suspended: { variant: 'danger', label: '紧急停用' },
  pending_rebind: { variant: 'warning', label: '待重绑' },
  enabled: { variant: 'success', label: '已启用' },
  bound: { variant: 'success', label: '已绑定' },
  denied: { variant: 'danger', label: '已拒绝' },
  read: { variant: 'info', label: '已读' },
  pending_cleanup: { variant: 'warning', label: '待清理' },

  // ===== 命令（SM-ORG-002/003/004）=====
  processing: { variant: 'info', label: '处理中' },
  pending_exec: { variant: 'warning', label: '待执行' },
  pending_manual_retry: { variant: 'warning', label: '待手动重试' },
  initiator_lost_rights: { variant: 'danger', label: '发起人失权' },
  precondition_failed: { variant: 'danger', label: '前置条件失败' },
  exec_failed: { variant: 'danger', label: '执行失败' },
  executed: { variant: 'success', label: '已执行' },
  executing: { variant: 'info', label: '执行中' },
  invalidated: { variant: 'neutral', label: '已作废' },
  partially_failed: { variant: 'danger', label: '部分失败' },
  failed_keep_original: { variant: 'danger', label: '失败·保留原值' },
  overdue: { variant: 'warning', label: '已超期' },
  ended: { variant: 'neutral', label: '已结束' },
  hold: { variant: 'warning', label: '暂缓' },

  // ===== 招新活动（SM-REC-001）=====
  in_progress: { variant: 'warning', label: '进行中' },
  configuring: { variant: 'info', label: '配置中' },
  pending_publish: { variant: 'warning', label: '待发布' },
  paused: { variant: 'warning', label: '已暂停' },
  completed: { variant: 'success', label: '已完成' },
  cancelled: { variant: 'neutral', label: '已取消' },
  force_completed: { variant: 'neutral', label: '已强制完成' },

  // ===== 报名通道（SM-REC-002）=====
  not_open: { variant: 'neutral', label: '未开放' },
  open: { variant: 'success', label: '开放中' },
  opening: { variant: 'info', label: '开放中' },
  closed: { variant: 'neutral', label: '已关闭' },
  closed_final: { variant: 'neutral', label: '已截止' },

  // ===== 申请与修订（SM-REC-003）=====
  submitted: { variant: 'info', label: '已提交' },
  under_review: { variant: 'info', label: '审核中' },
  revision_requested: { variant: 'warning', label: '需修订' },
  revised: { variant: 'info', label: '已修订' },
  revision: { variant: 'warning', label: '修订中' },
  withdrawn: { variant: 'neutral', label: '已撤回' },
  rejected: { variant: 'danger', label: '已拒绝' },
  accepted: { variant: 'success', label: '已接受' },
  exited: { variant: 'neutral', label: '已退出' },
  exiting: { variant: 'warning', label: '退出中' },
  exiting_cleanup: { variant: 'neutral', label: '退出清理中' },
  adjustment_overdue: { variant: 'warning', label: '调整超期' },
  identity_anomaly: { variant: 'danger', label: '身份异常' },
  not_qualified: { variant: 'danger', label: '资格失效' },

  // ===== 部门路径与结论（SM-REC-004）=====
  pending: { variant: 'warning', label: '处理中' },
  evaluating: { variant: 'info', label: '评估中' },
  decided: { variant: 'info', label: '已决定' },
  waitlist: { variant: 'warning', label: '候补中' },

  // ===== 面试记录（SM-REC-005）=====
  pending_selection: { variant: 'info', label: '待选时' },
  scheduled: { variant: 'info', label: '已排期' },
  confirmed: { variant: 'success', label: '已确认' },
  confirmed_success: { variant: 'success', label: '确认成功' },
  confirm_pending: { variant: 'warning', label: '确认待定' },
  force_closed: { variant: 'neutral', label: '已强制关闭' },
  rescheduled: { variant: 'warning', label: '已改期' },
  leave: { variant: 'warning', label: '请假' },
  late: { variant: 'warning', label: '迟到' },
  absent: { variant: 'danger', label: '缺勤' },
  cancel: { variant: 'neutral', label: '已取消' },
  cancelled_archived: { variant: 'neutral', label: '已取消·归档' },
  completed_archived: { variant: 'neutral', label: '已完成·归档' },

  // ===== 邀请（SM-INV-001 / SM-MEM-004）=====
  sent: { variant: 'info', label: '已发送' },
  pending_acceptance: { variant: 'warning', label: '待接受' },
  pending_casdoor_sync: { variant: 'warning', label: '同步中' },
  accepted_pending_sync: { variant: 'success', label: '已接受·同步中' },
  accepted_locked: { variant: 'success', label: '已锁定' },
  effective: { variant: 'success', label: '已生效' },
  failed: { variant: 'danger', label: '失败' },
  expired: { variant: 'neutral', label: '已过期' },
  sync_failed: { variant: 'danger', label: '同步失败' },
  sync_anomaly: { variant: 'danger', label: '同步异常' },
  invite_pending: { variant: 'info', label: '邀请待定' },
  invite_phase: { variant: 'info', label: '邀请阶段' },
  invited: { variant: 'info', label: '已邀请' },
  target_already_member: { variant: 'warning', label: '已是成员' },

  // ===== 成员 / 部门关系（SM-MEM-001/002/003）=====
  active: { variant: 'success', label: '正常' },
  suspended: { variant: 'warning', label: '已暂停' },
  removed: { variant: 'neutral', label: '已移除' },
  non_member: { variant: 'neutral', label: '非成员' },
  pending_effective: { variant: 'warning', label: '待生效' },
  transferring: { variant: 'info', label: '调动中' },
  locked: { variant: 'neutral', label: '已锁定' },

  // ===== 联合（SM-JNT-*）=====
  club_confirm: { variant: 'info', label: '社团确认中' },
  closing_confirm: { variant: 'warning', label: '关闭确认中' },
  force_suspended: { variant: 'danger', label: '已强制暂停' },
  confirming: { variant: 'warning', label: '确认中' },

  // ===== 表单 / 文件 / 通知 / 导出 =====
  previewing: { variant: 'info', label: '预览中' },
  uploading: { variant: 'info', label: '上传中' },
  uploaded: { variant: 'info', label: '已上传' },
  checking: { variant: 'warning', label: '检查中' },
  quarantined: { variant: 'danger', label: '已隔离' },
  generating: { variant: 'info', label: '生成中' },
  downloaded: { variant: 'success', label: '已下载' },
  delivered: { variant: 'success', label: '已送达' },
  approved: { variant: 'success', label: '已批准' },
  approved_pending_exec: { variant: 'warning', label: '已批准·待执行' },
  reconfirmed: { variant: 'success', label: '已再确认' },
  selecting: { variant: 'info', label: '选时中' },
}

export function resolveStatusLabel(status: string): StatusLabel | undefined {
  return STATE_LABELS[status]
}