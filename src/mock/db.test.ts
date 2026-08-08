import { beforeEach, describe, expect, it } from 'vitest'

import {
  departmentApplications,
  membershipInvitations,
  appointmentCommands,
  resignationRequests,
  exitRequests,
  members,
  decideDepartmentApplication,
  executeDepartmentApplication,
  withdrawInvitation,
  confirmInvitationSync,
  cancelAppointmentCommand,
  reconfirmAppointmentCommand,
  decideResignationRequest,
} from './db'
import { resetDb } from './reset'

beforeEach(() => {
  resetDb()
})

describe('成员状态机接线（P1-C7 SM-MEM/SM-ORG）', () => {
  it('SM-MEM-003：部门申请 approve→execute(首次失败)→重试→effective，非法重复审批被拒', () => {
    const app = departmentApplications.find((a) => a.id === 'dap-001')!
    const approved = decideDepartmentApplication('dap-001', 'approve', 'mem-002', '张明远')
    expect(approved.ok).toBe(true)
    expect(app.status).toBe('approved_pending_exec')

    const dup = decideDepartmentApplication('dap-001', 'approve', 'mem-002', '张明远')
    expect(dup.ok).toBe(false)

    const first = executeDepartmentApplication('dap-001')
    expect(first.ok).toBe(false)
    expect(app.status).toBe('exec_failed')

    const second = executeDepartmentApplication('dap-001')
    expect(second.ok).toBe(true)
    expect(app.status).toBe('effective')
  })

  it('SM-MEM-004 邀请撤回与回读确认均经状态机', () => {
    const inv = membershipInvitations.find((i) => i.id === 'minv-001')!
    const withdrawn = withdrawInvitation('minv-001')
    expect(withdrawn.ok).toBe(true)
    expect(inv.status).toBe('withdrawn')

    const dup = withdrawInvitation('minv-001')
    expect(dup.ok).toBe(false)

    const confirmed = confirmInvitationSync('minv-002')
    expect(confirmed.ok).toBe(true)
    expect(membershipInvitations.find((i) => i.id === 'minv-002')!.status).toBe('effective')
  })

  it('SM-ORG-003 任命命令：取消与重新确认受状态约束', () => {
    const cancelled = cancelAppointmentCommand('apc-001')
    expect(cancelled.ok).toBe(true)
    expect(appointmentCommands.find((c) => c.id === 'apc-001')!.status).toBe('cancelled')

    const again = cancelAppointmentCommand('apc-001')
    expect(again.ok).toBe(false)

    const reconfirmed = reconfirmAppointmentCommand('apc-002', '2025-08-10T10:00:00+08:00')
    expect(reconfirmed.ok).toBe(true)
    expect(appointmentCommands.find((c) => c.id === 'apc-002')!.status).toBe('reconfirmed')
  })

  it('SM-MEM-001 辞职批准进入 exiting，原职位按 SM-MEM-002 结束', () => {
    const approved = decideResignationRequest('res-001', 'approve', '张明远')
    expect(approved.ok).toBe(true)
    const member = members.find((m) => m.id === 'mem-002')!
    expect(member.status).toBe('exiting')
    const pos = member.positions.find((p) => p.status === 'active')
    expect(pos).toBeUndefined()
    expect(member.positions.every((p) => p.status === 'ended')).toBe(true)
    expect(resignationRequests.find((r) => r.id === 'res-001')!.status).toBe('approved')
  })
})

describe('#78 遗留：种子相对时间运行期派生', () => {
  it('resetDb 后种子 dueAt/expiredAt/scheduledAt 按当前时钟重算（正负语义稳定）', () => {
    // 种子 res-002（-1 天）与 exit-req-002（-1 天）恢复后仍为过去时间 → overdue 派生稳定
    const resDue = resignationRequests.find((r) => r.id === 'res-002')!.dueAt
    const exitDue = exitRequests.find((r) => r.id === 'exit-req-002')!.dueAt
    const dapDue = departmentApplications.find((a) => a.id === 'dap-002')!.dueAt
    expect(new Date(resDue).getTime()).toBeLessThan(Date.now())
    expect(new Date(exitDue).getTime()).toBeLessThan(Date.now())
    expect(new Date(dapDue).getTime()).toBeLessThan(Date.now())
    // 未来偏移种子（res-001 +2 天）恢复后仍为未来
    expect(new Date(resignationRequests.find((r) => r.id === 'res-001')!.dueAt).getTime()).toBeGreaterThan(Date.now())
    // 相对差与偏移一致（±1 天容差覆盖时钟毫秒差）
    const dayMs = 24 * 60 * 60 * 1000
    expect(new Date(exitDue).getTime()).toBeGreaterThan(Date.now() - 2 * dayMs)
    expect(new Date(exitDue).getTime()).toBeLessThan(Date.now())
    // 邀请过期/预约时间同样被重算（minv-002 已过期、apc-002 未来）
    expect(new Date(membershipInvitations.find((i) => i.id === 'minv-002')!.expiredAt as string).getTime()).toBeLessThan(Date.now())
    expect(new Date(appointmentCommands.find((c) => c.id === 'apc-002')!.scheduledAt as string).getTime()).toBeGreaterThan(Date.now())
  })
})