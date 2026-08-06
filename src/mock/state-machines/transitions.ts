/**
 * 29 个状态机的精确转换表（依据 docs/specification/SRS-状态机转换明细-v1.0.md）
 * 每个状态机：from → { event: to }。未列出的跳转一律拒绝并保持原状态。
 * 业务前置条件校验由 db 业务函数完成；这里负责状态转换合法性的第一道闸。
 */

export interface TransitionTable {
  [from: string]: Record<string, string | readonly string[]>
}

export const TRANSITIONS: Record<string, TransitionTable> = {
  /** SM-IDN-001 账号访问 */
  'SM-IDN-001': {
    anonymous: { login_success: 'authenticated' },
    authenticating: { login_success: 'authenticated', login_failure: 'anonymous' },
    authenticated: {
      account_disabled: 'disabled',
      account_deleted: 'deleted',
      casdoor_unavailable: 'casdoor_unconfirmable',
      session_expired: 'authenticated',
    },
    casdoor_unconfirmable: {
      whitelist_action: 'casdoor_unconfirmable',
      whitelist_rejected: 'casdoor_unconfirmable',
      timeout_15min: 'casdoor_unconfirmable',
      recovered_valid: 'authenticated',
      recovered_disabled: 'disabled',
      recovered_deleted: 'deleted',
    },
    disabled: { recovered_valid: 'authenticated' },
  },

  /** SM-IDN-002 资料写入门 */
  'SM-IDN-002': {
    incomplete: {
      save_profile: ['incomplete', 'pending_email_verification', 'complete'],
      new_required_field: 'incomplete',
    },
    pending_email_verification: {
      resend: 'pending_email_verification',
      verify_success: ['complete', 'scope_restricted'],
      link_expired: 'pending_email_verification',
    },
    complete: {
      new_required_field: 'incomplete',
      scope_missing: 'scope_restricted',
    },
    scope_restricted: { supplemented: ['complete', 'scope_restricted'] },
  },

  /** SM-IDN-003 资料同步 */
  'SM-IDN-003': {
    synced: { local_save_whitelist: 'pending_sync', authoritative_converge: 'synced' },
    pending_sync: { start_write: 'retrying', temporary_failed: 'retrying' },
    retrying: {
      write_confirmed: 'synced',
      retryable_failed: 'retrying',
      failed_24h: 'pending_readback',
      superseded: ['synced', 'pending_sync'],
    },
    pending_readback: {
      readback_is_target: 'synced',
      readback_is_old_value: 'rolled_back',
      readback_third_value: 'conflict_pending',
      readback_authoritative_third: 'synced',
    },
    conflict_pending: {
      user_keep_local: 'pending_sync',
      user_accept_casdoor: 'synced',
      stale_choice_rejected: 'conflict_pending',
    },
    rolled_back: { admin_reinitiate: 'pending_sync' },
  },

  /** SM-ORG-001 社团接入 */
  'SM-ORG-001': {
    wizard_pending: {
      save_step: 'wizard_pending',
      complete_validation: 'enabled',
      disconnect: 'pending_rebind',
    },
    enabled: {
      normal_suspend: 'suspended',
      force_suspend: 'suspended',
      group_lost: 'sync_abnormal_ro',
    },
    suspended: {
      re_enable: 'enabled',
      group_lost: 'sync_abnormal_ro',
    },
    sync_abnormal_ro: {
      repair_ok: 'suspended',
      rebind_ok: 'suspended',
      disconnect: 'pending_rebind',
    },
    pending_rebind: { reaccess_ok: 'suspended' },
  },

  /** SM-ORG-002 Group 关系命令 */
  'SM-ORG-002': {
    pending: { submit: 'processing' },
    processing: {
      confirmed_success: 'confirmed_success',
      failed_15min: 'failed_keep_original',
      partial_compensated: ['processing', 'failed_keep_original'],
    },
    failed_keep_original: { manual_retry: 'pending_manual_retry' },
    pending_manual_retry: {
      exec_success: 'confirmed_success',
      exec_failed: 'failed_keep_original',
    },
  },

  /** SM-ORG-003 预约管理命令 */
  'SM-ORG-003': {
    pending_exec: {
      execute_ok: 'executing',
      initiator_lost: 'initiator_lost_rights',
      precondition_lost: 'precondition_failed',
      cancel: 'cancelled',
    },
    initiator_lost_rights: { reconfirm: 'reconfirmed', cancel: 'cancelled' },
    precondition_failed: {
      cancel: 'cancelled',
      reconfirm_new_time: 'reconfirmed',
    },
    reconfirmed: {
      execute_ok: 'executing',
      initiator_lost: 'initiator_lost_rights',
      precondition_lost: 'precondition_failed',
    },
    executing: {
      group_confirmed: 'executed',
      external_failed: 'exec_failed',
    },
    exec_failed: { retry: 'executing' },
  },

  /** SM-ORG-004 受控批量操作 */
  'SM-ORG-004': {
    selecting: { generate_preview: 'previewing' },
    previewing: {
      modify: 'selecting',
      confirm: 'executing',
      cancel: 'cancelled',
    },
    executing: {
      all_success: 'completed',
      partial_failed: 'partially_failed',
      all_failed: 'partially_failed',
    },
    partially_failed: { retry_failed: 'executing' },
  },

  /** SM-REC-001 普通招新活动 */
  'SM-REC-001': {
    draft: { publish: 'in_progress', cancel: 'cancelled' },
    in_progress: {
      pause: 'paused',
      complete: 'completed',
      cancel: 'cancelled',
      force_complete: 'force_completed',
    },
    paused: {
      resume: 'in_progress',
      cancel: 'cancelled',
      force_complete: 'force_completed',
    },
    completed: { archive: 'archived' },
    cancelled: { archive: 'archived' },
    force_completed: { archive: 'archived' },
  },

  /** SM-REC-002 普通报名通道 */
  'SM-REC-002': {
    not_open: { open: 'open', activity_final: 'closed' },
    open: {
      pause: 'paused',
      close: 'closed',
      deadline_reached: 'closed',
      activity_pause: 'open',
      activity_final: 'closed',
    },
    paused: {
      resume_with_deadline: 'open',
      close: 'closed',
      activity_final: 'closed',
    },
    closed: { reopen_with_deadline: 'open' },
  },

  /** SM-REC-003 申请与修订 */
  'SM-REC-003': {
    draft: { submit: 'submitted', identity_disabled: 'identity_anomaly' },
    submitted: {
      edit_before_deadline: 'draft',
      withdraw_submission: 'draft',
      request_supplement: 'revision_requested',
      rule_tightening: 'submitted',
      extend_window: 'submitted',
      timeout: 'adjustment_overdue',
      withdraw: 'exited',
      identity_disabled: 'identity_anomaly',
    },
    revision_requested: {
      submit_in_window: 'submitted',
      identity_disabled: 'identity_anomaly',
    },
    revised: { submit: 'submitted', identity_disabled: 'identity_anomaly' },
    exited: {
      resubmit_before_deadline: 'submitted',
      create_recovery_window: 'exited',
      recovery_resubmit: 'submitted',
    },
    adjustment_overdue: {
      extend_window: 'submitted',
      not_qualified: 'not_qualified',
    },
    identity_anomaly: {
      recovered: 'submitted',
      publish_not_qualified: 'not_qualified',
    },
  },

  /** SM-REC-004 部门路径与结论 */
  'SM-REC-004': {
    pending: { formal_volunteer: 'evaluating', transfer_path: 'evaluating' },
    evaluating: {
      hold: 'hold',
      decide: 'decided',
      set_label: 'decided',
      waitlist: 'waitlist',
      publish: 'published',
    },
    hold: {
      resume: 'evaluating',
      decide: 'decided',
      waitlist: 'waitlist',
      deadline_reminder: 'hold',
    },
    decided: {
      clear_label: 'evaluating',
      waitlist: 'waitlist',
      publish: 'published',
      revise: 'published',
    },
    waitlist: {
      promote_invite: 'published',
      publish: 'published',
    },
    published: {
      revise_before_accept: 'published',
      archive: 'published',
      force_close: 'published',
    },
  },

  /** SM-REC-005 面试记录 */
  'SM-REC-005': {
    pending_selection: {
      select: 'scheduled',
      admin_arrange: 'scheduled',
      cancel: 'cancelled',
      skip_round: 'cancelled',
      invalidate: 'invalidated',
    },
    scheduled: {
      reschedule: 'scheduled',
      leave: 'leave',
      late: 'late',
      absent: 'absent',
      start: 'in_progress',
      cancel: 'cancelled',
      skip_round: 'cancelled',
      invalidate: 'invalidated',
    },
    leave: { rearrange: 'scheduled', cancel: 'cancelled', invalidate: 'invalidated' },
    late: { rearrange: 'scheduled', start: 'in_progress', cancel: 'cancelled', invalidate: 'invalidated' },
    absent: { rearrange: 'scheduled', cancel: 'cancelled', invalidate: 'invalidated' },
    in_progress: {
      complete: 'completed',
      invalidate: 'invalidated',
    },
    completed: { invalidate: 'invalidated' },
    invalidated: { rearrange: 'scheduled' },
  },

  /** SM-JNT-001 联合活动 */
  'SM-JNT-001': {
    draft: {
      create: 'draft',
      club_confirm: 'draft',
      confirm_all: 'confirmed',
      adjust_list: 'draft',
      deadline_expired: 'draft',
      collect_cancel: 'cancelled',
      force_close: 'force_closed',
    },
    confirmed: {
      first_publish: 'published',
      collect_cancel: 'cancelled',
      force_close: 'force_closed',
    },
    published: {
      first_invite: 'invite_phase',
      collect_cancel: 'cancelled',
      force_close: 'force_closed',
    },
    invite_phase: {
      all_invites_final: 'closing_confirm',
      force_close: 'force_closed',
    },
    closing_confirm: {
      confirm_all: 'closed',
      force_close: 'force_closed',
    },
  },

  /** SM-JNT-002 参与社团关系 */
  'SM-JNT-002': {
    invited: {
      confirm: 'accepted',
      deadline_expired: 'confirm_pending',
      withdraw: 'removed',
    },
    accepted: {
      confirm: 'accepted',
      list_changed: 'confirm_pending',
      withdraw: 'removed',
      first_publish: 'locked',
    },
    confirm_pending: {
      confirm: 'accepted',
      deadline_expired: 'confirm_pending',
      withdraw: 'removed',
    },
    locked: { force_suspend: 'force_suspended' },
    force_suspended: { re_enable: 'locked' },
  },

  /** SM-JNT-003 联合申请 */
  'SM-JNT-003': {
    draft: {
      save: 'draft',
      submit: 'submitted',
      submit_without_consent: 'draft',
      activity_final: 'archived',
    },
    submitted: {
      activity_final: 'archived',
      club_suspend: 'submitted',
      withdraw: 'draft',
    },
  },

  /** SM-JNT-004 联合单次面试记录 */
  'SM-JNT-004': {
    pending_selection: {
      select: 'scheduled',
      admin_arrange: 'scheduled',
      activity_final: 'cancelled_archived',
    },
    scheduled: {
      reschedule: 'scheduled',
      leave: 'leave',
      late: 'late',
      absent: 'absent',
      start: 'in_progress',
      invalidate: 'invalidated',
    },
    leave: { rearrange: 'scheduled', invalidate: 'invalidated' },
    late: { rearrange: 'scheduled', start: 'in_progress', invalidate: 'invalidated' },
    absent: { rearrange: 'scheduled', invalidate: 'invalidated' },
    in_progress: {
      complete: 'completed',
      invalidate: 'invalidated',
      activity_final: 'cancelled_archived',
    },
    completed: {
      author_evaluate: 'completed',
      invalidate: 'invalidated',
      activity_final: 'completed_archived',
    },
    invalidated: { rearrange: 'scheduled' },
  },

  /** SM-JNT-005 参与社团结论 */
  'SM-JNT-005': {
    pending: { create: 'evaluating' },
    evaluating: {
      modify: 'evaluating',
      create_invite: 'invite_pending',
      activity_final: 'archived',
    },
    invite_pending: {
      invite_terminal: 'evaluating',
      accepted: 'accepted_locked',
      activity_final: 'archived',
      force_invalidated: 'archived',
    },
    accepted_locked: {},
  },

  /** SM-JNT-006 联合报名通道 */
  'SM-JNT-006': {
    not_open: { first_open: 'open', activity_final: 'closed' },
    open: {
      pause: 'paused',
      extend: 'open',
      manual_close: 'closed',
      deadline_reached: 'closed',
      activity_final: 'closed',
    },
    paused: {
      resume_with_deadline: 'open',
      manual_close: 'closed',
      activity_final: 'closed',
    },
    closed: { reopen_with_deadline: 'open' },
  },

  /** SM-INV-001 邀请 */
  'SM-INV-001': {
    draft: { send: 'pending_acceptance' },
    pending_acceptance: {
      accept: 'accepted',
      reject: 'rejected',
      withdraw: 'withdrawn',
      expire: 'expired',
      invalidate: 'pending_acceptance',
      force_invalidated: 'expired',
    },
    accepted: {
      casdoor_sync_ok: 'effective',
      sync_fail: 'sync_failed',
      sync_retry: 'accepted',
    },
    sync_failed: { retry: 'accepted' },
    rejected: { reissue: 'pending_acceptance' },
    withdrawn: { reissue: 'pending_acceptance' },
    expired: { reissue: 'pending_acceptance' },
  },

  /** SM-MEM-001 成员经历 */
  'SM-MEM-001': {
    non_member: { accept_invite: 'pending_effective', appoint: 'pending_effective' },
    pending_effective: {
      confirmed: 'active',
      failed_15min: 'pending_effective',
      compensated: 'non_member',
    },
    active: {
      exit_approved: 'exiting',
      removed: 'exiting',
      external_removed: ['exited', 'sync_anomaly'],
      tenure_end: 'active',
    },
    exiting: {
      confirmed: 'exited',
      failed: 'active',
    },
  },

  /** SM-MEM-002 部门/职位关系 */
  'SM-MEM-002': {
    active: {
      start_change: 'transferring',
      end_change: 'ended',
      external_change: ['active', 'ended', 'sync_anomaly'],
    },
    transferring: {
      confirmed: 'active',
      failed_compensated: 'ended',
      failed: 'sync_anomaly',
    },
    ended: { start_change: 'transferring', external_change: 'ended' },
    sync_anomaly: { manual_fix: ['active', 'ended'] },
  },

  /** SM-MEM-003 部门关系申请 */
  'SM-MEM-003': {
    draft: { submit: 'under_review' },
    under_review: {
      withdraw: 'withdrawn',
      reject: 'rejected',
      approve: 'approved_pending_exec',
    },
    approved_pending_exec: { execute: 'executing' },
    executing: {
      confirmed: 'effective',
      failed: 'exec_failed',
    },
    exec_failed: { retry: 'executing' },
  },

  /** SM-MEM-004 常规入社邀请 */
  'SM-MEM-004': {
    sent: { send: 'pending_acceptance' },
    pending_acceptance: {
      reject: 'rejected',
      withdraw: 'withdrawn',
      expire: 'expired',
      already_member: 'target_already_member',
      accept: 'accepted_pending_sync',
    },
    accepted_pending_sync: {
      confirmed: 'effective',
      retryable_fail: 'sync_failed',
      compensated: 'sync_failed',
      unrecoverable: 'sync_anomaly',
    },
    sync_failed: {
      retry: ['accepted_pending_sync', 'effective'],
      unrecoverable: 'sync_anomaly',
    },
    rejected: { reissue: 'pending_acceptance' },
    withdrawn: { reissue: 'pending_acceptance' },
    expired: { reissue: 'pending_acceptance' },
    target_already_member: { reissue: 'pending_acceptance' },
  },

  /** SM-FORM-001 表单定义 */
  'SM-FORM-001': {
    draft: { publish: 'published', preview_test: 'draft' },
    published: { deprecate: 'deprecated', clone: 'draft' },
    deprecated: { reuse: 'draft', clone: 'draft' },
  },

  /** SM-FORM-002 表单提交 */
  'SM-FORM-002': {
    draft: {
      migrate: 'draft',
      submit_request: 'checking',
      delete: 'deleted',
    },
    checking: {
      all_pass: 'submitted',
      fail_or_unavailable: 'draft',
    },
    submitted: {
      edit_allowed: 'revision',
      lock: 'locked',
    },
    revision: { submit: 'submitted', lock: 'locked' },
    locked: { correction_approved: 'locked' },
  },

  /** SM-FILE-001 文件 */
  'SM-FILE-001': {
    uploading: { complete: 'checking' },
    checking: {
      pass: 'approved',
      danger: 'quarantined',
      service_unavailable: 'checking',
    },
    approved: {
      bind_submit: 'bound',
      no_refs: 'pending_cleanup',
    },
    quarantined: { no_refs: 'pending_cleanup' },
    pending_cleanup: { cleaned: 'deleted' },
    bound: { formal_delete: 'pending_cleanup' },
  },

  /** SM-NTF-001 通知事实 */
  'SM-NTF-001': {
    pending: {
      deliver: 'delivered',
      pause: 'paused',
      fail_retry: 'pending',
      email_success: 'delivered',
      email_failed_24h: 'failed',
    },
    paused: { resume: 'pending' },
    delivered: { read: 'read' },
  },

  /** SM-AUD-001 纠错 */
  'SM-AUD-001': {
    draft: { submit: 'submitted' },
    submitted: {
      approve: 'approved',
      reject: 'rejected',
      withdraw: 'withdrawn',
      deadline: 'overdue',
    },
    overdue: {
      approve: 'approved',
      reject: 'rejected',
      withdraw: 'withdrawn',
    },
    approved: { execute: 'executed' },
  },

  /** SM-EXP-001 导出任务 */
  'SM-EXP-001': {
    pending: { start: 'generating', lose_rights: 'denied', expire: 'expired', delete: 'deleted' },
    generating: {
      success: 'completed',
      fail: 'failed',
      lose_rights: 'denied',
      expire: 'expired',
    },
    failed: {
      retry: 'pending',
      delete: 'deleted',
      expire: 'expired',
    },
    completed: {
      download: 'completed',
      lose_rights: 'denied',
      expire: 'expired',
      delete: 'deleted',
      formal_delete_hit: 'deleted',
    },
  },
}

/** 校验状态转换是否合法（精确转换表） */
export function assertTransition(
  machineId: string,
  fromState: string | null | undefined,
  toState: string,
  event: string
): { ok: boolean; reason?: string } {
  const table = TRANSITIONS[machineId]
  if (!table) return { ok: false, reason: `未知状态机: ${machineId}` }
  if (fromState == null) return { ok: true }
  const events = table[fromState]
  if (!events) return { ok: false, reason: `状态 ${fromState} 不存在合法转换` }
  const targets = events[event]
  if (!targets) return { ok: false, reason: `事件 ${event} 在状态 ${fromState} 下不允许` }
  const allowed = Array.isArray(targets) ? targets : [targets]
  if (!allowed.includes(toState)) {
    return { ok: false, reason: `状态 ${fromState} → ${toState}（事件 ${event}）不在合法转换表内` }
  }
  return { ok: true }
}
