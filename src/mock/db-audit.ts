/**
 * Mock 有状态库：审计日志（AUD）
 * 社团版 / 管理员版审计查询共用同一可写内存库。
 * P1-010 闭环：纠错处置、保留策略发布/执行等高风险动作统一通过 writeAuditLog 落库，
 * 审计查询接口读取 auditLogsDb（不再返回硬编码数组），保证「动作发生 → 日志可见」闭环。
 */

export interface AuditLogEntry {
  id: string
  actorName: string
  action: string
  targetType: string
  targetId: string
  detail: string
  createdAt: string
  /** org = 社团域审计（/api/org/:clubId/audit/logs）；platform = 平台域审计（/api/admin/audit/logs） */
  scope: 'org' | 'platform'
}

let auditLogSeq = 1000

/** 审计日志共享内存库（社团域 + 平台域种子数据） */
export const auditLogsDb: AuditLogEntry[] = [
  // ---- 社团域种子 ----
  { id: 'log-001', actorName: '张明远', action: '发布招新活动', targetType: '活动', targetId: 'act-001', detail: '2025 秋季招新', createdAt: '2025-08-01T10:30:00+08:00', scope: 'org' },
  { id: 'log-002', actorName: '李思颖', action: '审批部门申请', targetType: '成员', targetId: 'mem-001', detail: '陈雨桐 技术->运营', createdAt: '2025-07-29T14:00:00+08:00', scope: 'org' },
  { id: 'log-003', actorName: '王浩然', action: '提交评价', targetType: '申请', targetId: 'app-003', detail: '王梓涵 4分', createdAt: '2025-08-04T11:00:00+08:00', scope: 'org' },
  { id: 'log-004', actorName: '张明远', action: '发送邀请', targetType: '邀请', targetId: 'rinv-001', detail: '陈雨桐 技术部', createdAt: '2025-08-04T12:00:00+08:00', scope: 'org' },
  // ---- 平台域种子 ----
  { id: 'log-101', actorName: '超级管理员', action: '强制关闭联合活动', targetType: '联合活动', targetId: 'jnt-001', detail: '计算机+电子联合招新', createdAt: '2025-08-01T09:00:00+08:00', scope: 'platform' },
  { id: 'log-102', actorName: '超级管理员', action: '批准社团接入', targetType: '社团', targetId: 'club-001', detail: '计算机协会', createdAt: '2025-07-01T10:00:00+08:00', scope: 'platform' },
]

export function setAuditLogSeq(seq: number): void {
  auditLogSeq = seq
}

/** 写入一条审计日志（自动生成 id/createdAt，插入到最前） */
export function writeAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): AuditLogEntry {
  auditLogSeq += 1
  const record: AuditLogEntry = {
    ...entry,
    id: 'log-' + auditLogSeq,
    createdAt: new Date().toISOString(),
  }
  auditLogsDb.unshift(record)
  return record
}
