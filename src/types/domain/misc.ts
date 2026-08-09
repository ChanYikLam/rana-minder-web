/** 领域模型类型 - 通知、审计、统计、配置 */

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
  link: string | null
}

export interface AuditLog {
  id: string
  actorId: string
  actorName: string
  action: string
  targetType: string
  targetId: string
  detail: string
  createdAt: string
}

export interface Correction {
  id: string
  targetType: string
  targetId: string
  reason: string
  evidence: string
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn' | 'executed'
  createdAt: string
}

export interface ExportTask {
  id: string
  type: string
  status: ExportTaskStatus
  createdAt: string
  completedAt: string | null
  expiredAt: string | null
  downloadUrl: string | null
}

/**
 * MRM-014：导出任务状态词表与 SM-EXP-001 状态机一致
 * （来源：state-machines/transitions.ts 转换表；不含文件下载接口返回的展示状态 downloaded）
 */
export type ExportTaskStatus =
  | 'pending'
  | 'generating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'denied'
  | 'expired'
  | 'deleted'

export interface StatItem {
  label: string
  value: number
  trend: 'up' | 'down' | 'flat' | null
  trendValue: number | null
}
