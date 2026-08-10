/**
 * Mock 有状态库：事实纠错（COR）
 * 社团版 / 个人中心版 / 管理员版共用同一内存库，发起/处理/撤回真实落库。
 * P1-010 审计闭环：每次状态流转（申请/审批/撤回）都会写入 auditTrail 审计轨迹，
 * 审批记录 decidedBy/decidedAt，撤回记录 withdrawnBy/withdrawnAt，全程可追溯。
 * SM-AUD-001：submitted --deadline--> overdue；overdue 仍可 approve/reject/withdraw。
 */

/** 纠错审批期限（毫秒）：提交后超过该时长仍未处置则流转为 overdue */
export const CORRECTION_DEADLINE_MS = 24 * 60 * 60 * 1000

/**
 * 按当前时钟派生纠错状态：submitted 且超过审批期限 → overdue（SM-AUD-001 deadline 事件）。
 * 列表读取时调用，保证逾期纠错在真实运行时可见并可被处置（P2-1）。
 * 派生只读，不落库：记录底层 status 仍为 submitted，处置时经守卫校验后正常流转。
 */
export function deriveCorrectionStatus(record: CorrectionRecord, now: number = Date.now()): CorrectionRecord['status'] {
  if (record.status === 'submitted' && now - new Date(record.submittedAt).getTime() > CORRECTION_DEADLINE_MS) {
    return 'overdue'
  }
  return record.status
}

/** 种子相对时间辅助（与 reset.ts reseedRelativeTimes 同思路，避免跨天/跨周 overdue 漂移） */
const SEED_HOUR_MS = 60 * 60 * 1000
const seedNow = Date.now()

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
    // 1 小时前提交，未逾期（相对当前时钟，避免跨天漂移）
    submittedAt: new Date(seedNow - 1 * SEED_HOUR_MS).toISOString(),
    submitterName: '王浩然',
    auditTrail: [{ action: 'submit', actorName: '王浩然', at: new Date(seedNow - 1 * SEED_HOUR_MS).toISOString() }],
  },
  {
    id: 'cor-002',
    targetType: '成员信息',
    targetId: 'mem-002',
    reason: '部门信息未更新',
    evidence: '审批截图',
    status: 'approved',
    submittedAt: new Date(seedNow - 30 * SEED_HOUR_MS).toISOString(),
    submitterName: '李思颖',
    decidedBy: '张明远',
    decidedAt: new Date(seedNow - 29 * SEED_HOUR_MS).toISOString(),
    auditTrail: [
      { action: 'submit', actorName: '李思颖', at: new Date(seedNow - 30 * SEED_HOUR_MS).toISOString() },
      { action: 'approve', actorName: '张明远', at: new Date(seedNow - 29 * SEED_HOUR_MS).toISOString(), note: '部门信息已核实' },
    ],
  },
  {
    id: 'cor-003',
    targetType: '成员信息',
    targetId: 'mem-001',
    reason: '职位信息需更新',
    evidence: '组织架构截图',
    status: 'rejected',
    submittedAt: new Date(seedNow - 40 * SEED_HOUR_MS).toISOString(),
    submitterName: '林晓薇',
    decidedBy: '张明远',
    decidedAt: new Date(seedNow - 39 * SEED_HOUR_MS).toISOString(),
    auditTrail: [
      { action: 'submit', actorName: '林晓薇', at: new Date(seedNow - 40 * SEED_HOUR_MS).toISOString() },
      { action: 'reject', actorName: '张明远', at: new Date(seedNow - 39 * SEED_HOUR_MS).toISOString(), note: '信息已核实无误' },
    ],
  },
  {
    id: 'cor-004',
    targetType: '成员信息',
    targetId: 'mem-004',
    reason: '学号填写有误',
    evidence: '学生证截图',
    status: 'withdrawn',
    submittedAt: new Date(seedNow - 50 * SEED_HOUR_MS).toISOString(),
    submitterName: '周明轩',
    withdrawnBy: '周明轩',
    withdrawnAt: new Date(seedNow - 49 * SEED_HOUR_MS).toISOString(),
    auditTrail: [
      { action: 'submit', actorName: '周明轩', at: new Date(seedNow - 50 * SEED_HOUR_MS).toISOString() },
      { action: 'withdraw', actorName: '周明轩', at: new Date(seedNow - 49 * SEED_HOUR_MS).toISOString() },
    ],
  },
  {
    // P2-1：显式 overdue 种子 —— 48 小时前提交、超期未处置，列表直接可见并可批准/拒绝/撤回
    id: 'cor-005',
    targetType: '成员信息',
    targetId: 'mem-005',
    reason: '联系电话信息有误',
    evidence: '联系方式截图',
    status: 'overdue',
    submittedAt: new Date(seedNow - 48 * SEED_HOUR_MS).toISOString(),
    submitterName: '赵雨萌',
    auditTrail: [{ action: 'submit', actorName: '赵雨萌', at: new Date(seedNow - 48 * SEED_HOUR_MS).toISOString() }],
  },
]
