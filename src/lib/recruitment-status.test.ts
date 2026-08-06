import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  APPLICATION_STATUS_LABELS,
  applicationStatusLabel,
  isEditableStatus,
  isRecoveryWindowActive,
  terminalStatusHint,
  TERMINAL_STATUS_HINTS,
} from './recruitment-status'

describe('recruitment-status 状态词表', () => {
  it('覆盖两页用到的全部申请状态，未知状态回退原文', () => {
    for (const status of ['draft', 'submitted', 'archived', 'revision_requested', 'exited', 'adjustment_overdue', 'identity_anomaly', 'not_qualified', 'accepted']) {
      expect(APPLICATION_STATUS_LABELS[status], `缺少状态 ${status} 的文案`).toBeTruthy()
    }
    expect(applicationStatusLabel('draft')).toBe('草稿')
    expect(applicationStatusLabel('submitted')).toBe('已提交')
    expect(applicationStatusLabel('__unknown__')).toBe('__unknown__')
  })
})

describe('isRecoveryWindowActive', () => {
  afterEach(() => vi.restoreAllMocks())

  it('非 exited 状态一律不判定为恢复窗口内', () => {
    expect(isRecoveryWindowActive({ status: 'draft', recoveryWindowDeadline: new Date(Date.now() + 86_400_000).toISOString() })).toBe(false)
    expect(isRecoveryWindowActive({ status: 'submitted' })).toBe(false)
  })

  it('exited 且 deadline 缺失时判定为无恢复窗口', () => {
    expect(isRecoveryWindowActive({ status: 'exited', recoveryWindowDeadline: null })).toBe(false)
    expect(isRecoveryWindowActive({ status: 'exited' })).toBe(false)
  })

  it('exited 且 deadline 在未来时判定为恢复窗口内', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(isRecoveryWindowActive({ status: 'exited', recoveryWindowDeadline: future })).toBe(true)
  })

  it('exited 且 deadline 已过期时判定为窗口外', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    expect(isRecoveryWindowActive({ status: 'exited', recoveryWindowDeadline: past })).toBe(false)
  })
})

describe('isEditableStatus（两页共用可编辑性状态机）', () => {
  it('无申请记录：可编辑', () => {
    expect(isEditableStatus(null)).toBe(true)
    expect(isEditableStatus(undefined)).toBe(true)
  })

  it('draft / revision_requested：可编辑', () => {
    expect(isEditableStatus({ status: 'draft' })).toBe(true)
    expect(isEditableStatus({ status: 'revision_requested' })).toBe(true)
  })

  it('exited：恢复窗口内可编辑，窗口外不可编辑', () => {
    const active = new Date(Date.now() + 86_400_000).toISOString()
    const expired = new Date(Date.now() - 86_400_000).toISOString()
    expect(isEditableStatus({ status: 'exited', recoveryWindowDeadline: active })).toBe(true)
    expect(isEditableStatus({ status: 'exited', recoveryWindowDeadline: expired })).toBe(false)
    expect(isEditableStatus({ status: 'exited', recoveryWindowDeadline: null })).toBe(false)
  })

  it('终态（submitted/archived/adjustment_overdue/identity_anomaly/not_qualified/accepted）：不可编辑', () => {
    for (const status of ['submitted', 'archived', 'adjustment_overdue', 'identity_anomaly', 'not_qualified', 'accepted']) {
      expect(isEditableStatus({ status }), `状态 ${status} 应不可编辑`).toBe(false)
    }
  })
})

describe('terminalStatusHint', () => {
  it('已知终态给出可解释文案，未知状态回退通用文案', () => {
    expect(terminalStatusHint('exited')).toBe(TERMINAL_STATUS_HINTS.exited)
    expect(terminalStatusHint('adjustment_overdue')).toContain('请联系管理员')
    expect(terminalStatusHint('accepted')).toContain('流程已结束')
    expect(terminalStatusHint('__unknown__')).toBe('该状态下不可编辑或提交报名')
  })
})
