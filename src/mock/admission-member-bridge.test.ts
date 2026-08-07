import { describe, expect, it, beforeEach } from 'vitest'
import { members, listMembers } from './db'
import { createMemberFromAdmission } from './db'
import { respondRecInvitation, confirmRecInvitationSync, createJointInvitation, respondJointInvitation, confirmJointInvitationSync, jointInvitations, jointApplications, recruitmentInvitations, APPLICANT_PROFILES } from './db-recruitment'
import { resetRecruitmentDB, resetDb } from './reset'

interface RecInvite { id: string; acceptedAt: string | null }
interface JointInvite { id: string; acceptedAt: string | null }

/** P0-002 回归：接受录取（REC/JNT）后确认生效必须创建成员生命周期记录，业务生效时间 = 接受时间 */
describe('P0-002 录取接受后成员创建桥（SM-MEM 关系模型）', () => {
  beforeEach(() => {
    resetRecruitmentDB()
    resetDb()
  })

  it('普通招新录取：接受 → 成员同步确认后创建成员，joinedAt = 接受时间，部门职位生效', () => {
    const accepted = respondRecInvitation('rinv-001', 'accept', 'u-002')
    expect(accepted.ok).toBe(true)
    const inv = accepted.data as unknown as RecInvite
    expect(inv.acceptedAt).toBeTruthy()

    expect(listMembers('club-001').some((m) => m.studentId === '20240002')).toBe(false)

    const confirmed = confirmRecInvitationSync('rinv-001')
    expect(confirmed.ok).toBe(true)

    const member = listMembers('club-001').find((m) => m.studentId === '20240002')
    expect(member, '接受录取后必须产生成员记录').toBeTruthy()
    expect(member!.name).toBe('陈雨桐')
    expect(member!.status).toBe('active')
    expect(member!.joinedAt).toBe(inv.acceptedAt)
    expect(member!.positions.map((p) => p.departmentName)).toContain('技术部')
  })

  it('联合录取：结论 admit → 邀请接受 → 同步确认后创建成员（部门取报名意向且属于该社团）', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok, created.error || '').toBe(true)
    const invite = jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-001')
    expect(invite).toBeTruthy()

    const accepted = respondJointInvitation(invite!.id, 'accept', 'u-006')
    expect(accepted.ok).toBe(true)
    const accInv = jointInvitations.find((i) => i.id === invite!.id) as unknown as JointInvite
    expect(accInv.acceptedAt).toBeTruthy()

    expect(listMembers('club-001').some((m) => m.studentId === '20240006')).toBe(false)

    const confirmed = confirmJointInvitationSync(invite!.id)
    expect(confirmed.ok).toBe(true)

    const member = listMembers('club-001').find((m) => m.studentId === '20240006')
    expect(member, '联合录取确认后必须产生成员记录').toBeTruthy()
    expect(member!.name).toBe('林婉婷')
    expect(member!.status).toBe('active')
    expect(member!.joinedAt).toBe(accInv.acceptedAt)
    expect(member!.positions.map((p) => p.departmentName)).toContain('技术部')
  })

  it('幂等：同社团同学号已存在当前成员时不重复创建', () => {
    const first = createMemberFromAdmission('club-001', { studentId: '20240099', name: '幂等测试', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(first.created).toBe(true)
    const before = members.length
    const second = createMemberFromAdmission('club-001', { studentId: '20240099', name: '幂等测试', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(second.ok).toBe(true)
    expect(second.created).toBe(false)
    expect(members.length).toBe(before)
  })

  it('空学号：createMemberFromAdmission 返回错误而非静默成功', () => {
    const empty = createMemberFromAdmission('club-001', { studentId: '', name: '无学号', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(empty.ok).toBe(false)
    expect(empty.error).toBeTruthy()
    const before = members.length
    expect(members.length).toBe(before)
  })

  it('普通招新确认：成员创建失败时 casdoorSync 保持 processing 且可重试，不产生「已确认但无成员」中间态', () => {
    const accepted = respondRecInvitation('rinv-001', 'accept', 'u-002')
    expect(accepted.ok).toBe(true)
    const inv = recruitmentInvitations.find((i) => i.id === 'rinv-001')!
    expect(inv.casdoorSync).toBe('processing')

    // 模拟成员创建失败（学号缺失）
    APPLICANT_PROFILES['u-002'] = { name: '陈雨桐', studentId: '' }
    const failed = confirmRecInvitationSync('rinv-001')
    expect(failed.ok).toBe(false)
    expect(inv.casdoorSync).toBe('processing')
    expect(inv.status).toBe('accepted')
    expect(listMembers('club-001').some((m) => m.studentId === '20240002')).toBe(false)

    // 恢复后重试成功
    APPLICANT_PROFILES['u-002'] = { name: '陈雨桐', studentId: '20240002' }
    const retried = confirmRecInvitationSync('rinv-001')
    expect(retried.ok).toBe(true)
    expect(inv.casdoorSync).toBe('confirmed')
    expect(listMembers('club-001').some((m) => m.studentId === '20240002')).toBe(true)
  })

  it('联合录取确认：成员创建失败时 casdoorSync 保持 processing 且可重试', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok, created.error || '').toBe(true)
    const invite = jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-001')!
    const accepted = respondJointInvitation(invite.id, 'accept', 'u-006')
    expect(accepted.ok).toBe(true)
    expect(invite.casdoorSync).toBe('processing')

    // 模拟成员创建失败（联合申请学号缺失）
    jointApplications.find((a) => a.jointId === 'jnt-001' && a.applicantId === 'u-006')!.studentId = ''
    const failed = confirmJointInvitationSync(invite.id)
    expect(failed.ok).toBe(false)
    expect(invite.casdoorSync).toBe('processing')
    expect(listMembers('club-001').some((m) => m.studentId === '20240006')).toBe(false)

    // 恢复后重试成功
    jointApplications.find((a) => a.jointId === 'jnt-001' && a.applicantId === 'u-006')!.studentId = '20240006'
    const retried = confirmJointInvitationSync(invite.id)
    expect(retried.ok).toBe(true)
    expect(invite.casdoorSync).toBe('confirmed')
    expect(listMembers('club-001').some((m) => m.studentId === '20240006')).toBe(true)
  })
})
