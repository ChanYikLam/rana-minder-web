import { beforeEach, describe, expect, it } from 'vitest'

import {
  resetDb,
  departmentApplications,
  membershipInvitations,
  appointmentCommands,
  resignationRequests,
  members,
  decideDepartmentApplication,
  executeDepartmentApplication,
  withdrawInvitation,
  confirmInvitationSync,
  cancelAppointmentCommand,
  reconfirmAppointmentCommand,
  decideResignationRequest,
} from './db'

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