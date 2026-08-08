import { describe, expect, it, beforeEach } from 'vitest'
import { members, listMembers } from './db'
import { createMemberFromAdmission } from './db'
import { respondRecInvitation, confirmRecInvitationSync, createJointInvitation, respondJointInvitation, confirmJointInvitationSync, withdrawJointInvitation, setJointConclusion, jointConclusions, jointInvitations, jointApplications, recruitmentInvitations, APPLICANT_PROFILES } from './db-recruitment'
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

  it('部门生效日期口径：acceptedAt 带 +08:00 时区时 startDate 取日期部分，与 joinedAt 同口径', () => {
    const admitted = createMemberFromAdmission('club-001', { studentId: '20240088', name: '时区测试', departmentId: 'dept-001', departmentName: '技术部', acceptedAt: '2025-07-26T15:00:00+08:00' })
    expect(admitted.ok).toBe(true)
    const member = members.find((m) => m.studentId === '20240088')!
    expect(member.joinedAt).toBe('2025-07-26T15:00:00+08:00')
    expect(member.positions[0].startDate).toBe('2025-07-26')
    expect(member.positions[0].startDate).toBe(member.joinedAt.slice(0, 10))
  })

  it('幂等边界：已有 exiting（离职中）成员时显式报错而非静默跳过', () => {
    members.push({ id: 'mem-exit-1', clubId: 'club-001', studentId: '20240077', name: '离职中', email: 'x@example.edu.cn', phone: '13800000000', status: 'exiting', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null, positions: [], tenures: [], departmentHistory: [], anomalies: [] })
    const before = members.length
    const result = createMemberFromAdmission('club-001', { studentId: '20240077', name: '离职中', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(result.ok).toBe(false)
    expect(result.created).toBe(false)
    expect(result.error).toContain('离职中')
    expect(members.length).toBe(before)
  })

  it('幂等边界：已有 pending_effective（待生效）成员时显式报错而非静默跳过', () => {
    members.push({ id: 'mem-pend-1', clubId: 'club-001', studentId: '20240066', name: '待生效', email: 'x@example.edu.cn', phone: '13800000000', status: 'pending_effective', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null, positions: [], tenures: [], departmentHistory: [], anomalies: [] })
    const before = members.length
    const result = createMemberFromAdmission('club-001', { studentId: '20240066', name: '待生效', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(result.ok).toBe(false)
    expect(result.created).toBe(false)
    expect(result.error).toContain('待生效')
    expect(members.length).toBe(before)
  })

  it('幂等边界：已有 sync_anomaly（同步异常）成员时显式报错而非静默复用', () => {
    members.push({ id: 'mem-anm-1', clubId: 'club-001', studentId: '20240055', name: '同步异常', email: 'x@example.edu.cn', phone: '13800000000', status: 'sync_anomaly', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null, positions: [], tenures: [], departmentHistory: [], anomalies: [] })
    const before = members.length
    const result = createMemberFromAdmission('club-001', { studentId: '20240055', name: '同步异常', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(result.ok).toBe(false)
    expect(result.created).toBe(false)
    expect(result.error).toContain('同步异常')
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

  it('联合录取确认：报名意向未匹配该社团部门时显式报错，不静默创建无部门成员', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-002', 7)
    expect(created.ok, created.error || '').toBe(true)
    const invite = jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-002')!
    const accepted = respondJointInvitation(invite.id, 'accept', 'u-006')
    expect(accepted.ok).toBe(true)
    expect(invite.casdoorSync).toBe('processing')

    // u-006 意向为 dept-001（club-001 技术部），与 club-002 开设部门（dept-101/102）不匹配
    const failed = confirmJointInvitationSync(invite.id)
    expect(failed.ok).toBe(false)
    expect(failed.error).toContain('未匹配')
    expect(invite.casdoorSync).toBe('processing')
    expect(listMembers('club-002').some((m) => m.studentId === '20240006')).toBe(false)

    // 补齐匹配的意向部门后重试成功，且部门为该社团开设部门
    const app = jointApplications.find((a) => a.jointId === 'jnt-001' && a.applicantId === 'u-006')!
    app.preferences = [{ departmentId: 'dept-101', departmentName: '嵌入式组' }]
    const retried = confirmJointInvitationSync(invite.id)
    expect(retried.ok).toBe(true)
    expect(invite.casdoorSync).toBe('confirmed')
    const member = listMembers('club-002').find((m) => m.studentId === '20240006')!
    expect(member.positions.map((p) => p.departmentName)).toContain('嵌入式组')
  })

  it('P2-1：普通招新确认创建的成员联系方式来自申请人档案（非空，不再回退占位/空串）', () => {
    const accepted = respondRecInvitation('rinv-001', 'accept', 'u-002')
    expect(accepted.ok).toBe(true)
    expect(confirmRecInvitationSync('rinv-001').ok).toBe(true)
    const member = listMembers('club-001').find((m) => m.studentId === '20240002')!
    // u-002 → user-applicant-002（applicant2）联系方式
    expect(member.email).toBe('applicant2@example.edu.cn')
    expect(member.phone).toBe('13800000002')
  })

  it('P2-1：联合录取确认创建的成员联系方式来自申请人档案（非空）', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok, created.error || '').toBe(true)
    const invite = jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-001')!
    expect(respondJointInvitation(invite.id, 'accept', 'u-006').ok).toBe(true)
    expect(confirmJointInvitationSync(invite.id).ok).toBe(true)
    const member = listMembers('club-001').find((m) => m.studentId === '20240006')!
    // u-006 → user-applicant-003（applicant3）联系方式
    expect(member.email).toBe('applicant3@example.edu.cn')
    expect(member.phone).toBe('13800000003')
  })

  it('P2-1：动态注册申请人（无 auth 用户）回退候选人档案联系方式', () => {
    const member = createMemberFromAdmission('club-001', { studentId: '20240010', name: '周明轩', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(member.ok).toBe(true)
    const created = members.find((m) => m.studentId === '20240010')!
    // 20240010 → candidates.cand-001
    expect(created.email).toBe('candidate@example.edu.cn')
    expect(created.phone).toBe('13800000010')
  })

  it('P2-1：调用方透传联系方式优先于候选人档案', () => {
    const member = createMemberFromAdmission('club-001', { studentId: '20240010', name: '周明轩', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString(), email: 'override@example.edu.cn', phone: '13000000000' })
    expect(member.ok).toBe(true)
    const created = members.find((m) => m.studentId === '20240010')!
    expect(created.email).toBe('override@example.edu.cn')
    expect(created.phone).toBe('13000000000')
  })
})

/** 新-4/新-6 回归：SM-JNT-005 结论状态机断言覆盖——con.status 不再绕过状态机直接赋值 */
describe('SM-JNT-005 结论状态机断言覆盖', () => {
  beforeEach(() => {
    resetRecruitmentDB()
    resetDb()
  })

  const conclusionOf = (applicantId: string, clubId: string) =>
    jointConclusions.find((c) => c.jointId === 'jnt-001' && c.applicantId === applicantId && c.clubId === clubId)

  it('createJointInvitation：evaluating 结论发邀请 → invite_pending（create_invite 事件）', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok, created.error || '').toBe(true)
    // 种子结论 status 为 evaluating，发邀请后进入 invite_pending
    expect(conclusionOf('u-006', 'club-001')?.status).toBe('invite_pending')
  })

  it('respondJointInvitation accept：invite_pending 结论 → accepted_locked（accepted 事件）', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok).toBe(true)
    const inv = jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-001')!
    const accepted = respondJointInvitation(inv.id, 'accept', 'u-006')
    expect(accepted.ok, accepted.error || '').toBe(true)
    expect(conclusionOf('u-006', 'club-001')?.status).toBe('accepted_locked')
  })

  it('respondJointInvitation reject：invite_pending 结论 → evaluating（invite_terminal 事件）', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok).toBe(true)
    const inv = jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-001')!
    const rejected = respondJointInvitation(inv.id, 'reject', 'u-006')
    expect(rejected.ok, rejected.error || '').toBe(true)
    expect(conclusionOf('u-006', 'club-001')?.status).toBe('evaluating')
  })

  it('withdrawJointInvitation：invite_pending 结论 → evaluating（invite_terminal 事件）', () => {
    const created = createJointInvitation('jnt-001', 'u-006', 'club-001', 7)
    expect(created.ok).toBe(true)
    const inv = jointInvitations.find((i) => i.applicantId === 'u-006' && i.clubId === 'club-001')!
    const withdrawn = withdrawJointInvitation(inv.id)
    expect(withdrawn.ok, withdrawn.error || '').toBe(true)
    expect(conclusionOf('u-006', 'club-001')?.status).toBe('evaluating')
  })

  it('setJointConclusion：pending 结论首次设置走 create 事件进入 evaluating', () => {
    // 手工构造 pending 结论（模拟未评估场景）
    const target = conclusionOf('u-006', 'club-001')
    if (target) target.status = 'pending'
    const result = setJointConclusion('jnt-001', 'u-006', 'club-001', 'admit', '张明远', 'club_leader')
    expect(result.ok, result.error || '').toBe(true)
    expect(conclusionOf('u-006', 'club-001')?.status).toBe('evaluating')
    expect(conclusionOf('u-006', 'club-001')?.conclusion).toBe('admit')
  })
})
