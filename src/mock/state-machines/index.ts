/**
 * Mock 层 29 个状态机枚举与转换校验
 * 来源：docs/specification/SRS-状态机转换明细-v1.0.md
 * 当前覆盖核心旅程涉及的状态机，其余增量补充
 */

/** 状态机 ID 到状态枚举的映射 */
export const STATE_MACHINES = {
  'SM-IDN-001': {
    name: '账号访问',
    states: ['anonymous', 'authenticating', 'authenticated', 'session_expired', 'degraded'] as const,
  },
  'SM-IDN-002': {
    name: '资料写入门',
    states: ['incomplete', 'pending_email_verification', 'complete', 'locked'] as const,
  },
  'SM-IDN-003': {
    name: '资料同步',
    states: ['synced', 'syncing', 'sync_failed', 'conflict_pending', 'conflict_resolved'] as const,
  },
  'SM-ORG-001': {
    name: '社团接入',
    states: ['pending_review', 'approved', 'rejected', 'suspended', 'archived'] as const,
  },
  'SM-ORG-002': {
    name: 'Group 关系',
    states: ['active', 'pending_sync', 'sync_failed', 'degraded'] as const,
  },
  'SM-ORG-003': {
    name: '预约管理',
    states: ['draft', 'pending_confirm', 'confirmed', 'executing', 'completed', 'partially_failed', 'cancelled'] as const,
  },
  'SM-ORG-004': {
    name: '批量操作',
    states: ['selecting', 'previewing', 'confirmed', 'executing', 'completed', 'partially_failed', 'cancelled'] as const,
  },
  'SM-REC-001': {
    name: '招新活动',
    states: ['draft', 'configuring', 'pending_publish', 'published', 'paused', 'closed', 'archived'] as const,
  },
  'SM-REC-002': {
    name: '报名通道',
    states: ['closed', 'opening', 'open', 'paused', 'closing', 'closed_final'] as const,
  },
  'SM-REC-003': {
    name: '申请修订',
    states: ['draft', 'submitted', 'under_review', 'revision_requested', 'revised', 'withdrawn', 'rejected', 'accepted'] as const,
  },
  'SM-REC-004': {
    name: '部门路径结论',
    states: ['pending', 'evaluating', 'concluded', 'published', 'revised'] as const,
  },
  'SM-REC-005': {
    name: '面试记录',
    states: ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled'] as const,
  },
  'SM-INV-001': {
    name: '邀请',
    states: ['draft', 'sent', 'pending_acceptance', 'accepted', 'rejected', 'withdrawn', 'expired', 'pending_casdoor_sync', 'effective', 'failed'] as const,
  },
  'SM-JNT-001': {
    name: '联合活动',
    states: ['draft', 'inviting', 'confirmed', 'publishing', 'published', 'in_progress', 'closing', 'closed', 'force_closed'] as const,
  },
  'SM-JNT-002': {
    name: '参与社团关系',
    states: ['invited', 'accepted', 'declined', 'withdrawn', 'removed'] as const,
  },
  'SM-JNT-003': {
    name: '联合申请',
    states: ['draft', 'consented', 'submitted', 'under_review', 'withdrawn', 'rejected', 'accepted'] as const,
  },
  'SM-JNT-004': {
    name: '联合面试记录',
    states: ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'invalidated', 'rescheduled'] as const,
  },
  'SM-JNT-005': {
    name: '参与社团结论',
    states: ['pending', 'evaluating', 'concluded', 'published', 'revised'] as const,
  },
  'SM-JNT-006': {
    name: '联合报名通道',
    states: ['closed', 'opening', 'open', 'paused', 'closing', 'closed_final'] as const,
  },
  'SM-MEM-001': {
    name: '成员经历',
    states: ['active', 'suspended', 'exiting', 'exited', 'removed', 'rejoining'] as const,
  },
  'SM-MEM-002': {
    name: '部门职位关系',
    states: ['active', 'pending_confirmation', 'transferring', 'suspended', 'ended'] as const,
  },
  'SM-MEM-003': {
    name: '部门关系申请',
    states: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn'] as const,
  },
  'SM-MEM-004': {
    name: '常规入社邀请',
    states: ['draft', 'sent', 'pending_acceptance', 'accepted', 'rejected', 'withdrawn', 'expired', 'pending_casdoor_sync', 'effective', 'failed'] as const,
  },
  'SM-FORM-001': {
    name: '表单定义',
    states: ['draft', 'published', 'deprecated', 'archived'] as const,
  },
  'SM-FORM-002': {
    name: '表单提交',
    states: ['draft', 'submitted', 'under_review', 'revision_requested', 'revised', 'accepted', 'rejected'] as const,
  },
  'SM-FILE-001': {
    name: '文件',
    states: ['uploading', 'uploaded', 'checking', 'quarantined', 'approved', 'rejected', 'deleted'] as const,
  },
  'SM-NTF-001': {
    name: '通知事实',
    states: ['pending', 'delivered', 'read', 'failed', 'expired'] as const,
  },
  'SM-AUD-001': {
    name: '纠错',
    states: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'executed'] as const,
  },
  'SM-EXP-001': {
    name: '导出任务',
    states: ['pending', 'generating', 'completed', 'failed', 'expired', 'downloaded'] as const,
  },
} as const

export type StateMachineId = keyof typeof STATE_MACHINES

/** 校验状态转换是否合法（简化版：检查目标状态是否在合法状态列表中） */
export function isValidTransition(
  machineId: StateMachineId,
  fromState: string,
  toState: string
): boolean {
  const machine = STATE_MACHINES[machineId]
  if (!machine) return false

  const states = machine.states as readonly string[]

  if (!states.includes(fromState) || !states.includes(toState)) {
    return false
  }

  // TODO: 按 SRS-状态机转换明细-v1.0.md 逐条实现 306 条转换规则
  // 当前为简化校验，后续按旅程增量补充精确转换表
  return true
}
