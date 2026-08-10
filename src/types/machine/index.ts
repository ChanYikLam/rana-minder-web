/**
 * 30 个状态机枚举与转换类型
 * 来源：docs/specification/SRS-状态机转换明细-v1.0.md（29 个）+ SM-MEM-005 辞职申请
 */

export type StateMachineId =
  | 'SM-IDN-001' | 'SM-IDN-002' | 'SM-IDN-003'
  | 'SM-ORG-001' | 'SM-ORG-002' | 'SM-ORG-003' | 'SM-ORG-004'
  | 'SM-REC-001' | 'SM-REC-002' | 'SM-REC-003' | 'SM-REC-004' | 'SM-REC-005'
  | 'SM-INV-001'
  | 'SM-JNT-001' | 'SM-JNT-002' | 'SM-JNT-003' | 'SM-JNT-004' | 'SM-JNT-005' | 'SM-JNT-006'
  | 'SM-MEM-001' | 'SM-MEM-002' | 'SM-MEM-003' | 'SM-MEM-004' | 'SM-MEM-005'
  | 'SM-FORM-001' | 'SM-FORM-002' | 'SM-FILE-001'
  | 'SM-NTF-001' | 'SM-AUD-001' | 'SM-EXP-001'

export interface StateTransition {
  machineId: StateMachineId
  fromState: string
  toState: string
  action: string
  guard?: string
}

export interface StateMachineMeta {
  id: StateMachineId
  name: string
  states: readonly string[]
}

/** 页面五状态枚举 */
export type PageState = 'normal' | 'loading' | 'empty' | 'error' | 'forbidden'
