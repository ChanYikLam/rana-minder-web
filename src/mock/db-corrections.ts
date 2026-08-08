/**
 * Mock 有状态库：事实纠错（COR）
 * 社团版 / 个人中心版 / 管理员版共用同一内存库，发起/处理/撤回真实落库。
 * P1-010 审计闭环：每次状态流转（申请/审批/撤回）都会写入 auditTrail 审计轨迹，
 * 审批记录 decidedBy/decidedAt，撤回记录 withdrawnBy/withdrawnAt，全程可追溯。
 */

export interface CorrectionAuditEntry {
  /** 流转动作：申请 / 批准 / 拒绝 / 撤回 */
  action: 'submit' | 'approve' | 'reject' | 'withdraw'
  /** 操作人 */
  actorName: string
  /** 操作时间 ISO */
  at: string
  /** 备注（如审批原因），可选 */
  note?: string
}

export interface CorrectionRecord {
  id: string
  targetType: string
  targetId: string
  reason: string
  evidence: string
  status: string
  submittedAt: string
  submitterName: string
  /** 审批人 / 审批时间（approve 或 reject 时写入） */
  decidedBy?: string
  decidedAt?: string
  /** 撤回人 / 撤回时间（withdraw 时写入） */
  withdrawnBy?: string
  withdrawnAt?: string
  /** 全生命周期审计轨迹（申请 → 审批/撤回），审计闭环可追溯 */
  auditTrail: CorrectionAuditEntry[]
}

/** 事实纠错共享内存库（社团/个人中心/管理员共用） */
export const correctionsDb: CorrectionRecord[] = [
  {
    id: 'cor-001',
    targetType: '申请记录',
    targetId: 'app-003',
    reason: '评分有误，应为 5 分',
    evidence: '截图',
    status: 'submitted',
    submittedAt: '2025-07-30T10:00:00+08:00',
    submitterName: '王浩然',
    auditTrail: [{ action: 'submit', actorName: '王浩然', at: '2025-07-30T10:00:00+08:00' }],
  },
  {
    id: 'cor-002',
    targetType: '成员信息',
    targetId: 'mem-002',
    reason: '部门信息未更新',
    evidence: '审批截图',
    status: 'approved',
    submittedAt: '2025-07-25T10:00:00+08:00',
    submitterName: '李思颖',
    decidedBy: '张明远',
    decidedAt: '2025-07-26T09:30:00+08:00',
    auditTrail: [
      { action: 'submit', actorName: '李思颖', at: '2025-07-25T10:00:00+08:00' },
      { action: 'approve', actorName: '张明远', at: '2025-07-26T09:30:00+08:00', note: '部门信息已核实' },
    ],
  },
]
