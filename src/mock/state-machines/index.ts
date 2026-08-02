/**
 * Mock 层 29 个状态机：单一事实来源 = ./transitions.ts 的精确转换表
 * （对应 docs/specification/SRS-状态机转换明细-v1.0.md，29 状态机）
 *
 * 本模块不再维护第二套硬编码状态枚举，所有状态与转换均从 TRANSITIONS 表推导，
 * 避免三套词表漂移。事件级校验请使用 assertTransition（带事件），
 * 本模块提供 isReachable(from→to) 与状态元数据。
 */

import { TRANSITIONS, assertTransition } from './transitions'
import type { StateMachineId } from '@/types/machine'

export const MACHINE_NAMES: Record<StateMachineId, string> = {
  'SM-IDN-001': '账号访问',
  'SM-IDN-002': '资料写入门',
  'SM-IDN-003': '资料同步',
  'SM-ORG-001': '社团接入',
  'SM-ORG-002': 'Group 关系命令',
  'SM-ORG-003': '预约管理命令',
  'SM-ORG-004': '受控批量操作',
  'SM-REC-001': '普通招新活动',
  'SM-REC-002': '普通报名通道',
  'SM-REC-003': '申请与修订',
  'SM-REC-004': '部门路径与结论',
  'SM-REC-005': '面试记录',
  'SM-INV-001': '邀请',
  'SM-JNT-001': '联合活动',
  'SM-JNT-002': '参与社团关系',
  'SM-JNT-003': '联合申请',
  'SM-JNT-004': '联合单次面试记录',
  'SM-JNT-005': '参与社团结论',
  'SM-JNT-006': '联合报名通道',
  'SM-MEM-001': '成员经历',
  'SM-MEM-002': '部门/职位关系',
  'SM-MEM-003': '部门关系申请',
  'SM-MEM-004': '常规入社邀请',
  'SM-FORM-001': '表单定义/模板',
  'SM-FORM-002': '表单提交',
  'SM-FILE-001': '文件',
  'SM-NTF-001': '通知事实/渠道',
  'SM-AUD-001': '纠错',
  'SM-EXP-001': '导出任务',
}

export interface MachineMeta {
  id: StateMachineId
  name: string
  states: readonly string[]
}

/** 从权威转换表推导每个状态机的全部合法状态（源状态 ∪ 目标状态） */
function deriveStates(machineId: StateMachineId): string[] {
  const table = TRANSITIONS[machineId]
  if (!table) return []
  const set = new Set<string>()
  for (const [from, events] of Object.entries(table)) {
    set.add(from)
    for (const targets of Object.values(events)) {
      for (const t of Array.isArray(targets) ? targets : [targets]) set.add(t)
    }
  }
  return [...set]
}

/** 29 个状态机元数据（词表唯一来源：transitions.ts） */
export const STATE_MACHINE_METAS: Record<StateMachineId, MachineMeta> =
  Object.fromEntries(
    (Object.keys(TRANSITIONS) as StateMachineId[]).map((id) => [
      id,
      { id, name: MACHINE_NAMES[id] ?? id, states: deriveStates(id) },
    ]),
  ) as unknown as Record<StateMachineId, MachineMeta>

/** 兼容旧导出：{ [id]: { name, states } } */
export const STATE_MACHINES: Record<string, { name: string; states: readonly string[] }> =
  STATE_MACHINE_METAS

/** 全部 29 个状态机 ID（与 types/machine 的 StateMachineId 一致） */
export const MACHINE_IDS: readonly StateMachineId[] = Object.keys(TRANSITIONS) as StateMachineId[]

export type { StateMachineId }

/** 状态是否属于该状态机的合法状态集 */
export function isValidState(machineId: StateMachineId, state: string): boolean {
  return (STATE_MACHINE_METAS[machineId]?.states ?? []).includes(state)
}

/**
 * 是否存在任意一条事件可把 from 迁到 to（事件级精确判定，不依赖事件名）。
 * 仅判断可达性；写操作必须携带事件走 assertTransition。
 */
export function isValidTransition(
  machineId: StateMachineId,
  fromState: string,
  toState: string,
): boolean {
  const table = TRANSITIONS[machineId]
  if (!table) return false
  const events = table[fromState]
  if (!events) return false
  for (const targets of Object.values(events)) {
    const allowed = Array.isArray(targets) ? targets : [targets]
    if (allowed.includes(toState)) return true
  }
  return false
}

/** 统计某状态机的精确事件→目标转换条数（含多目标拆分） */
export function transitionRuleCount(machineId: StateMachineId): number {
  const table = TRANSITIONS[machineId]
  if (!table) return 0
  let count = 0
  for (const events of Object.values(table)) {
    for (const targets of Object.values(events)) {
      count += Array.isArray(targets) ? targets.length : 1
    }
  }
  return count
}

/** 全部 29 个状态机的精确规则总数（事件→目标对，306 规则集） */
export function totalTransitionRuleCount(): number {
  return MACHINE_IDS.reduce((acc, id) => acc + transitionRuleCount(id), 0)
}

export { assertTransition }