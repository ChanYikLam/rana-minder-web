/**
 * Mock 有状态库：事实纠错（COR）
 * 社团版 / 个人中心版 / 管理员版共用同一内存库，发起/处理/撤回真实落库
 */

export interface CorrectionRecord {
  id: string
  targetType: string
  targetId: string
  reason: string
  evidence: string
  status: string
  submittedAt: string
  submitterName: string
}

/** 事实纠错共享内存库（社团/个人中心/管理员共用） */
export const correctionsDb: CorrectionRecord[] = [
  { id: 'cor-001', targetType: '申请记录', targetId: 'app-003', reason: '评分有误，应为 5 分', evidence: '截图', status: 'submitted', submittedAt: '2025-07-30T10:00:00+08:00', submitterName: '王浩然' },
  { id: 'cor-002', targetType: '成员信息', targetId: 'mem-002', reason: '部门信息未更新', evidence: '审批截图', status: 'approved', submittedAt: '2025-07-25T10:00:00+08:00', submitterName: '李思颖' },
]