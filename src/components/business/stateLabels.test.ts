import { describe, expect, it } from 'vitest'
import { STATE_LABELS, resolveStatusLabel } from '@/components/business/stateLabels'
import { STATE_MACHINES } from '@/mock/state-machines'

/**
 * 状态词表显示层：StateTag 渲染不得把任一状态机的合法状态回退成英文原文。
 */
describe('StateLabel 覆盖 transitions 全词表', () => {
  it('每个状态机的每个合法状态都有映射', () => {
    const covered = new Set(Object.keys(STATE_LABELS))
    const missing = new Set<string>()
    for (const machine of Object.values(STATE_MACHINES)) {
      for (const s of machine.states) {
        if (!covered.has(s)) missing.add(s)
      }
    }
    expect([...missing]).toEqual([])
  })

  it('全部映射都带中文标签与合法语义变体', () => {
    for (const config of Object.values(STATE_LABELS)) {
      expect(config.label.trim().length).toBeGreaterThan(0)
      expect(['success', 'danger', 'warning', 'info', 'neutral', 'selected']).toContain(config.variant)
    }
  })

  it('知名状态下 resolveStatusLabel 返回对应配置', () => {
    expect(resolveStatusLabel('in_progress')).toMatchObject({ label: '进行中', variant: 'warning' })
    expect(resolveStatusLabel('pending_acceptance')).toMatchObject({ label: '待接受', variant: 'warning' })
  })

  it('联合结论显示态 concluded 有映射，不回退英文原文', () => {
    expect(resolveStatusLabel('concluded')).toMatchObject({ label: '已结论', variant: 'success' })
  })

  it('未知状态返回 undefined（由调用方回退原文显示，不崩溃）', () => {
    expect(resolveStatusLabel('__unknown__')).toBeUndefined()
  })
})