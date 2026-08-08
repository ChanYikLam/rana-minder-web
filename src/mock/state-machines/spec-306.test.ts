import { describe, expect, it } from 'vitest'
import {
  MACHINE_IDS,
  MACHINE_NAMES,
  STATE_MACHINE_METAS,
  STATE_MACHINES,
  assertTransition,
  isValidState,
  isValidTransition,
  totalTransitionRuleCount,
  transitionRuleCount,
} from './index'
import { TRANSITIONS, assertTransition as assertExact, statesOf } from './transitions'
import type { StateMachineId } from '@/types/machine'

/** SRS 状态机转换明细 v1.0：29 个状态机、306 条转换规则 */
describe('状态机 spec-306 精确转换表', () => {
  it('存在且仅存在 29 个状态机', () => {
    expect(MACHINE_IDS.length).toBe(29)
    expect(new Set(MACHINE_IDS).size).toBe(29)
  })

  it('每个状态机都有中文名称与全局唯一状态集', () => {
    for (const id of MACHINE_IDS) {
      expect(MACHINE_NAMES[id]).toBeTruthy()
      const meta = STATE_MACHINE_METAS[id]
      expect(meta.states.length).toBeGreaterThan(0)
      expect(new Set(meta.states).size).toBe(meta.states.length)
    }
  })

  it('state-machines/index 与 transitions.ts 是同一份事实来源', () => {
    // TRANSITIONS 的 fromState / targets 与推导出的状态集一致
    for (const id of MACHINE_IDS) {
      const table = (TRANSITIONS as Record<string, Record<string, Record<string, string | string[]>>>)[id]
      const meta = STATE_MACHINE_METAS[id]
      for (const fromState of Object.keys(table)) {
        expect(meta.states).toContain(fromState)
        for (const targets of Object.values(table[fromState])) {
          for (const t of Array.isArray(targets) ? targets : [targets]) {
            expect(meta.states).toContain(t)
          }
        }
      }
    }
  })

  it('转换规则总数达标（SRS 304+ 规则集）', () => {
    expect(totalTransitionRuleCount()).toBeGreaterThanOrEqual(306)
  })

  it('每个状态机的规则数量稳定（防删改回归）', () => {
    // 快照关键状态机规则数，防止实现被静默裁减
    expect(transitionRuleCount('SM-IDN-003')).toBeGreaterThanOrEqual(10)
    expect(transitionRuleCount('SM-REC-003')).toBeGreaterThanOrEqual(10)
    expect(transitionRuleCount('SM-ORG-003')).toBeGreaterThanOrEqual(10)
    expect(transitionRuleCount('SM-EXP-001')).toBeGreaterThanOrEqual(4)
  })

  it('isValidState / isValidTransition / assertTransition 三方一致', () => {
    // 合法转换
    expect(isValidTransition('SM-REC-001', 'draft', 'in_progress')).toBe(true)
    expect(assertTransition('SM-REC-001', 'draft', 'in_progress', 'publish').ok).toBe(true)
    expect(assertExact('SM-REC-001', 'draft', 'in_progress', 'publish').ok).toBe(true)
    expect(isValidState('SM-REC-001', 'in_progress')).toBe(true)
    // 非法目标状态
    expect(isValidState('SM-REC-001', 'not_a_state')).toBe(false)
    // 非法转换（事件不匹配目标状态）
    expect(assertTransition('SM-REC-001', 'draft', 'cancelled', 'publish').ok).toBe(false)
    expect(isValidTransition('SM-REC-001', 'draft', 'cancelled')).toBe(true) // draft 存在到达 cancelled 的合法路径
    // 未列出的 from → 目标存在但事件不允许
    expect(isValidTransition('SM-REC-001', 'in_progress', 'archived')).toBe(false)
  })

  it('isValidTransition 不再是一律放行的简化校验', () => {
    // 旧实现：只要状态枚举存在即返回 true；现在必须存在真实转换路径
    expect(isValidTransition('SM-REC-001', 'draft', 'archived')).toBe(false)
    expect(isValidTransition('SM-REC-001', 'draft', 'in_progress')).toBe(true)
    expect(isValidTransition('SM-EXP-001', 'completed', 'pending')).toBe(false)
    expect(isValidTransition('SM-EXP-001', 'pending', 'generating')).toBe(true)
  })

  it('SM-EXP-001 包含 processing 中间态且真实可达（P2-5 词表对齐）', () => {
    // 实现层 settleExportTask/ExportPage 使用 processing 生成中间态，转换表必须包含
    expect(statesOf('SM-EXP-001')).toContain('processing')
    // 真实可达路径：pending --start--> generating --start_processing--> processing --success--> completed
    expect(isValidTransition('SM-EXP-001', 'pending', 'generating')).toBe(true)
    expect(isValidTransition('SM-EXP-001', 'generating', 'processing')).toBe(true)
    expect(assertTransition('SM-EXP-001', 'generating', 'processing', 'start_processing').ok).toBe(true)
    expect(assertTransition('SM-EXP-001', 'processing', 'completed', 'success').ok).toBe(true)
    // processing 为真实状态：不是死状态（有出边），也不是孤立状态（有入边）
    expect(assertTransition('SM-EXP-001', 'processing', 'failed', 'fail').ok).toBe(true)
    expect(assertTransition('SM-EXP-001', 'processing', 'expired', 'expire').ok).toBe(true)
  })

  it('STATE_MACHINES 兼容导出与元数据一致', () => {
    for (const id of MACHINE_IDS) {
      expect(STATE_MACHINES[id].name).toBe(STATE_MACHINE_METAS[id].name)
      expect(STATE_MACHINES[id].states).toEqual(STATE_MACHINE_METAS[id].states)
    }
  })

  it('事件白名单不允许未列举事件（保持原状态语义）', () => {
    // 未知事件 → 拒绝
    expect(assertTransition('SM-REC-001', 'draft', 'in_progress', 'unknown_event').ok).toBe(false)
    expect(assertTransition('SM-REC-001', 'draft', 'in_progress', 'publish').ok).toBe(true)
  })

  it('所有状态机 ID 均属于 StateMachineId 联合类型（types/machine）', () => {
    const ids: readonly StateMachineId[] = MACHINE_IDS
    expect(ids.every((i) => i.startsWith('SM-'))).toBe(true)
  })
})