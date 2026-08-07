/**
 * db.ts 成员生命周期补充测试（邀请/任命/部门申请/辞职/查询）。
 * 每个测试文件拥有独立模块实例（vitest isolate），种子数据与 db.test.ts 互不污染。
 * 各流程使用不同成员避免状态冲突：邀请→候选；任命→mem-002/003；部门申请→mem-001/003/006；辞职→mem-001。
 */
import { describe, expect, it } from 'vitest'
import * as db from './db'
import { getGroupDetail, syncPositionMembership, clubAccesses, groupSyncTraces } from './db-organization'
import {
  cancelAppointmentCommand,
  confirmInvitationSync,
  countActiveLeaders,
  createAppointmentCommand,
  createDepartmentApplication,
  createMembershipInvitation,
  createResignationRequest,
  decideDepartmentApplication,
  decideResignationRequest,
  executeAppointmentCommand,
  executeDepartmentApplication,
  findMember,
  getMemberProfile,
  getMemberStats,
  hasPendingInvitation,
  isLastLeader,
  listInvitations,
  listMembers,
  respondInvitation,
  searchCandidates,
  withdrawInvitation,
} from './db'

describe('成员查询与统计', () => {
  it('searchCandidates：空关键字返回全部非成员；姓名子串/学号精确命中；已是成员者过滤', () => {
    const all = searchCandidates('club-001', '')
    expect(all.map((c) => c.id)).toEqual(['cand-001', 'cand-002', 'cand-003'])
    expect(searchCandidates('club-001', '周').map((c) => c.id)).toEqual(['cand-001'])
    expect(searchCandidates('club-001', '20240011').map((c) => c.id)).toEqual(['cand-002'])
    // cand-004 已是成员，任何关键字下都不出现
    expect(all.some((c) => c.id === 'cand-004')).toBe(false)
    expect(searchCandidates('club-001', '陈雨桐').some((c) => c.id === 'cand-004')).toBe(false)
  })

  it('findMember / getMemberProfile：按社团+成员定位，跨社团不串', () => {
    expect(findMember('club-001', 'mem-001')?.name).toBe('陈雨桐')
    expect(findMember('club-001', 'mem-101')).toBeUndefined()
    expect(getMemberProfile('club-002', 'mem-101')?.name).toBe('张明远')
  })

  it('isLastLeader / countActiveLeaders：末位负责人判定', () => {
    // mem-004 是 club-001 唯一 active 负责人
    expect(isLastLeader('club-001', 'mem-004')).toBe(true)
    expect(isLastLeader('club-001', 'mem-001')).toBe(false)
    expect(countActiveLeaders('club-001')).toBe(1)
    // club-002 无负责人职位
    expect(countActiveLeaders('club-002')).toBe(0)
  })

  it('listMembers / getMemberStats：按社团统计 total/active/exited', () => {
    expect(listMembers('club-001')).toHaveLength(6)
    expect(listMembers('club-002').map((m) => m.id)).toEqual(['mem-101'])
    expect(getMemberStats('club-001')).toEqual({ total: 6, active: 5, exited: 1 })
  })
})

describe('入会邀请（createMembershipInvitation / withdraw / respond / confirm）', () => {
  it('createMembershipInvitation 三守卫：候选不存在 / 已是成员 / 重复待处理', () => {
    expect(createMembershipInvitation('club-001', { candidateId: 'cand-zzz', departmentId: null, expireDays: 7, actorId: 'user-hr-001', actorName: '李思颖' })).toMatchObject({ ok: false, error: '未找到该用户' })
    expect(createMembershipInvitation('club-001', { candidateId: 'cand-004', departmentId: null, expireDays: 7, actorId: 'user-hr-001', actorName: '李思颖' })).toMatchObject({ ok: false, error: '目标已是本社团成员' })
    // cand-001 已有种子待处理邀请（minv-001 pending_acceptance）
    expect(createMembershipInvitation('club-001', { candidateId: 'cand-001', departmentId: null, expireDays: 7, actorId: 'user-hr-001', actorName: '李思颖' })).toMatchObject({ ok: false, error: '该用户已有一份待处理邀请' })
  })

  it('withdrawInvitation：sent 态（状态机外补充）可撤回；撤回后释放占位；已撤回不可再撤', () => {
    const created = createMembershipInvitation('club-001', { candidateId: 'cand-002', departmentId: 'dept-001', expireDays: 7, actorId: 'user-hr-001', actorName: '李思颖' })
    expect(created.ok).toBe(true)
    expect(created.invitation).toMatchObject({ candidateId: 'cand-002', departmentName: '技术部', status: 'sent' })
    expect(hasPendingInvitation('club-001', 'cand-002')).toBe(true)

    const invId = created.invitation!.id
    const w1 = withdrawInvitation(invId)
    expect(w1.ok).toBe(true)
    expect(w1.invitation?.status).toBe('withdrawn')
    expect(hasPendingInvitation('club-001', 'cand-002')).toBe(false)

    // 撤回后释放占位，可重新邀请
    const recreated = createMembershipInvitation('club-001', { candidateId: 'cand-002', departmentId: null, expireDays: 7, actorId: 'user-hr-001', actorName: '李思颖' })
    expect(recreated.ok).toBe(true)
    const reInvId = recreated.invitation!.id
    expect(withdrawInvitation(reInvId).ok).toBe(true)

    expect(withdrawInvitation(invId)).toMatchObject({ ok: false, error: '仅待处理的邀请可撤回' })
    expect(withdrawInvitation('minv-ghost')).toMatchObject({ ok: false, error: '邀请不存在' })
  })

  it('respondInvitation：过期拒绝并置 expired（响应不带 invitation 字段）', () => {
    const created = createMembershipInvitation('club-001', { candidateId: 'cand-002', departmentId: null, expireDays: -1, actorId: 'user-hr-001', actorName: '李思颖' })
    expect(created.ok).toBe(true)
    const invId = created.invitation!.id
    // 模拟 send 步骤（过期分支需 pending_acceptance 才可经状态机置 expired）
    db.membershipInvitations.find((i) => i.id === invId)!.status = 'pending_acceptance'

    const r = respondInvitation(invId, 'accept')
    expect(r).toEqual({ ok: false, error: '邀请已过期' })
    expect(db.membershipInvitations.find((i) => i.id === invId)!.status).toBe('expired')
  })

  it('respondInvitation：sent 态直接拒绝被状态机拦截（需先 send 到 pending_acceptance）', () => {
    // 新建邀请为 sent 态；SM-MEM-004 仅 pending_acceptance 允许 reject/accept
    const created = createMembershipInvitation('club-001', { candidateId: 'cand-003', departmentId: null, expireDays: 7, actorId: 'user-hr-001', actorName: '李思颖' })
    const invId = created.invitation!.id

    expect(respondInvitation(invId, 'reject').ok).toBe(false)
  })

  it('respondInvitation：pending_acceptance 拒绝成功进入 rejected，重复操作被拒', () => {
    // cand-002 此前邀请已撤回/过期（非待处理），可重新创建
    const created = createMembershipInvitation('club-001', { candidateId: 'cand-002', departmentId: null, expireDays: 7, actorId: 'user-hr-001', actorName: '李思颖' })
    const invId = created.invitation!.id
    // 模拟 send 步骤（真实流程中 mock 层经 send 事件进入 pending_acceptance）
    db.membershipInvitations.find((i) => i.id === invId)!.status = 'pending_acceptance'

    const r = respondInvitation(invId, 'reject')
    expect(r.ok).toBe(true)
    expect(r.invitation?.status).toBe('rejected')

    expect(respondInvitation(invId, 'accept')).toMatchObject({ ok: false, error: '该邀请已处理，无法再次操作' })
    expect(respondInvitation('minv-ghost', 'accept')).toMatchObject({ ok: false, error: '邀请不存在' })
  })

  it('接受邀请并同步确认：整体生效，新成员带初始部门职位（基于种子 pending_acceptance 邀请）', () => {
    // minv-001 为种子待接受邀请（cand-001 周明轩，技术部）
    const invId = 'minv-001'

    const accepted = respondInvitation(invId, 'accept')
    expect(accepted.ok).toBe(true)
    expect(accepted.invitation?.status).toBe('accepted_pending_sync')
    expect(accepted.invitation?.acceptedAt).toBeTruthy()

    const confirmed = confirmInvitationSync(invId)
    expect(confirmed.ok).toBe(true)
    expect(confirmed.invitation?.status).toBe('effective')
    const pushed = listMembers('club-001').find((m) => m.name === '周明轩' && m.studentId === '20240010')!
    expect(pushed).toBeTruthy()
    expect(pushed.positions).toHaveLength(1)
    expect(pushed.positions[0]).toMatchObject({ departmentId: 'dept-001', departmentName: '技术部', status: 'active' })

    // 生效后不可再次确认
    expect(confirmInvitationSync(invId)).toMatchObject({ ok: false, error: '仅接受待同步的邀请可确认生效' })
    expect(confirmInvitationSync('minv-ghost')).toMatchObject({ ok: false, error: '邀请不存在' })
  })

  it('listInvitations 按社团过滤', () => {
    expect(listInvitations('club-001').length).toBeGreaterThan(0)
    expect(listInvitations('club-002')).toHaveLength(0)
  })
})

describe('任命命令（create / cancel / execute）', () => {
  it('dismiss 末位负责人被守卫拒绝；普通 dismiss 可创建', () => {
    // mem-004 是 club-001 唯一负责人
    expect(createAppointmentCommand('club-001', { action: 'dismiss', memberId: 'mem-004', memberName: '张明远', departmentId: null, departmentName: null, title: null, scheduledAt: null, actorName: '系统' })).toMatchObject({ ok: false, error: '最后一名负责人不能无交接离任，请先安排交接' })
    // mem-002 是副部长，非负责人 → 可免职
    expect(createAppointmentCommand('club-001', { action: 'dismiss', memberId: 'mem-002', memberName: '王浩然', departmentId: null, departmentName: null, title: null, scheduledAt: null, actorName: '系统' }).ok).toBe(true)
  })

  it('executeAppointmentCommand：首败演示 → exec_failed → 重试成功（appoint 写职位与 join 历史）', () => {
    const created = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'mem-003', memberName: '李思颖', departmentId: 'dept-001', departmentName: '技术部', title: '干事', scheduledAt: null, actorName: '系统' })
    const cmdId = created.command!.id

    const first = executeAppointmentCommand(cmdId)
    expect(first.ok).toBe(false)
    expect(first.error).toContain('执行失败')
    expect(first.command?.status).toBe('exec_failed')
    expect(first.command?.failReason).toBeTruthy()

    const retry = executeAppointmentCommand(cmdId)
    expect(retry.ok).toBe(true)
    expect(retry.command?.status).toBe('executed')
    const member = findMember('club-001', 'mem-003')!
    expect(member.positions.some((p) => p.departmentName === '技术部' && p.title === '干事' && p.status === 'active')).toBe(true)
    expect(member.departmentHistory[0]).toMatchObject({ action: 'join', departmentName: '技术部' })
  })

  it('executeAppointmentCommand dismiss：结束原职位、写免职 tenure 与 leave 历史', () => {
    const created = createAppointmentCommand('club-001', { action: 'dismiss', memberId: 'mem-002', memberName: '王浩然', departmentId: null, departmentName: null, title: null, scheduledAt: null, actorName: '系统' })
    const cmdId = created.command!.id

    executeAppointmentCommand(cmdId)
    const retry = executeAppointmentCommand(cmdId)
    expect(retry.ok).toBe(true)

    const member = findMember('club-001', 'mem-002')!
    expect(member.positions.every((p) => p.status !== 'active')).toBe(true)
    expect(member.tenures[0]).toMatchObject({ title: '副部长', endReason: '免职' })
    expect(member.departmentHistory[0]).toMatchObject({ action: 'leave' })
  })

  it('executeAppointmentCommand transfer：结束旧职位并写调岗 tenure 与 transfer 历史', () => {
    const created = createAppointmentCommand('club-001', { action: 'transfer', memberId: 'mem-006', memberName: '林晓薇', departmentId: 'dept-002', departmentName: '运营部', title: '部长', scheduledAt: null, actorName: '系统' })
    const cmdId = created.command!.id

    executeAppointmentCommand(cmdId)
    const retry = executeAppointmentCommand(cmdId)
    expect(retry.ok).toBe(true)

    const member = findMember('club-001', 'mem-006')!
    // 旧技术部部长职位结束
    expect(member.positions.some((p) => p.departmentName === '技术部' && p.status === 'ended')).toBe(true)
    // 新运营部部长职位生效
    expect(member.positions.some((p) => p.departmentName === '运营部' && p.title === '部长' && p.status === 'active')).toBe(true)
    // 调岗 tenure（旧职位的结束记录）
    expect(member.tenures.find((t) => t.endReason === '调岗')).toMatchObject({ departmentName: '技术部', title: '部长' })
    expect(member.departmentHistory[0]).toMatchObject({ action: 'transfer', departmentName: '运营部' })
  })

  it('cancelAppointmentCommand：命令不存在与重复取消', () => {
    expect(cancelAppointmentCommand('apc-ghost')).toMatchObject({ ok: false, error: '命令不存在' })
    const created = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'mem-003', memberName: '李思颖', departmentId: 'dept-001', departmentName: '技术部', title: '干事', scheduledAt: null, actorName: '系统' })
    const cmdId = created.command!.id
    expect(cancelAppointmentCommand(cmdId).ok).toBe(true)
    expect(cancelAppointmentCommand(cmdId)).toMatchObject({ ok: false })
  })
})

describe('部门关系申请（create / decide / execute）', () => {
  it('decideDepartmentApplication：自审/重复/驳回必填原因守卫', () => {
    const created = createDepartmentApplication('club-001', { applicantId: 'mem-001', applicantName: '陈雨桐', type: 'transfer', currentDept: '技术部', targetDeptId: 'dept-002', reason: '想转运营' })
    const appId = created.id

    // 自审（actorId 与 applicantId 同人）
    expect(decideDepartmentApplication(appId, 'approve', 'mem-001', '陈雨桐')).toMatchObject({ ok: false, error: '不能审批自己的申请' })
    // 驳回无原因
    expect(decideDepartmentApplication(appId, 'reject', 'user-hr-001', '李思颖')).toMatchObject({ ok: false, error: '驳回必须填写原因' })
    // 驳回成功
    const rejected = decideDepartmentApplication(appId, 'reject', 'user-hr-001', '李思颖', '编制已满')
    expect(rejected.ok).toBe(true)
    expect(rejected.app?.status).toBe('rejected')
    expect(rejected.app?.rejectReason).toBe('编制已满')
    // 重复操作
    expect(decideDepartmentApplication(appId, 'approve', 'user-hr-001', '李思颖')).toMatchObject({ ok: false, error: '该申请已处理或已撤回，无法重复操作' })
    // 不存在
    expect(decideDepartmentApplication('dap-ghost', 'approve', 'user-hr-001', '李思颖')).toMatchObject({ ok: false, error: '申请不存在' })
    // 未知部门：targetDeptName 为 null
    expect(createDepartmentApplication('club-001', { applicantId: 'mem-003', applicantName: '李思颖', type: 'join', currentDept: '', targetDeptId: 'dept-zzz', reason: 'x' }).targetDeptName).toBeNull()
  })

  it('executeDepartmentApplication join：一次生效并写成员职位与 join 历史', () => {
    const created = createDepartmentApplication('club-001', { applicantId: 'mem-001', applicantName: '陈雨桐', type: 'join', currentDept: '', targetDeptId: 'dept-003', reason: '兴趣' })
    const appId = created.id
    expect(decideDepartmentApplication(appId, 'approve', 'user-hr-001', '李思颖').ok).toBe(true)

    const executed = executeDepartmentApplication(appId)
    expect(executed.ok).toBe(true)
    expect(executed.app?.status).toBe('effective')
    const member = findMember('club-001', 'mem-001')!
    expect(member.positions.some((p) => p.departmentName === '设计部' && p.status === 'active')).toBe(true)
    expect(member.departmentHistory[0]).toMatchObject({ action: 'join', departmentName: '设计部' })
  })

  it('executeDepartmentApplication transfer：首败 → 重试生效，旧职位结束且写 transfer 历史', () => {
    // mem-003 此前经任命获得技术部干事职位（active）
    const created = createDepartmentApplication('club-001', { applicantId: 'mem-003', applicantName: '李思颖', type: 'transfer', currentDept: '技术部', targetDeptId: 'dept-002', reason: '想转运营' })
    const appId = created.id
    expect(decideDepartmentApplication(appId, 'approve', 'user-hr-001', '李思颖').ok).toBe(true)

    const first = executeDepartmentApplication(appId)
    expect(first.ok).toBe(false)
    expect(first.error).toContain('执行失败')
    expect(first.app?.status).toBe('exec_failed')

    const retry = executeDepartmentApplication(appId)
    expect(retry.ok).toBe(true)
    const member = findMember('club-001', 'mem-003')!
    // 旧技术部职位结束
    expect(member.positions.some((p) => p.departmentName === '技术部' && p.status === 'ended')).toBe(true)
    expect(member.positions.some((p) => p.departmentName === '运营部' && p.status === 'active')).toBe(true)
    expect(member.departmentHistory[0]).toMatchObject({ action: 'transfer', departmentName: '运营部' })
  })

  it('executeDepartmentApplication leave：结束对应部门职位', () => {
    // mem-001 仍持技术部（干事）职位（join 测试仅新增设计部职位）
    const created = createDepartmentApplication('club-001', { applicantId: 'mem-001', applicantName: '陈雨桐', type: 'leave', currentDept: '技术部', targetDeptId: 'dept-001', reason: '退出技术部' })
    const appId = created.id
    expect(decideDepartmentApplication(appId, 'approve', 'user-hr-001', '李思颖').ok).toBe(true)

    const executed = executeDepartmentApplication(appId)
    expect(executed.ok).toBe(true)
    const member = findMember('club-001', 'mem-001')!
    const pos = member.positions.find((p) => p.departmentName === '技术部')!
    expect(pos.status).toBe('ended')
    expect(member.departmentHistory[0]).toMatchObject({ action: 'leave', departmentName: '技术部' })
  })
})

describe('辞职申请（create / decide）', () => {
  it('decideResignationRequest：末位负责人审批被守卫拒绝', () => {
    const created = createResignationRequest('club-001', 'mem-004', '张明远', '技术部', '负责人', '个人原因')
    expect(decideResignationRequest(created.id, 'approve', '李思颖')).toMatchObject({ ok: false, error: '最后一名负责人不能无交接离任，请先安排交接' })
  })

  it('decideResignationRequest：驳回成功', () => {
    const created = createResignationRequest('club-001', 'mem-003', '李思颖', '人事部', '部长', '家庭原因')
    const r = decideResignationRequest(created.id, 'reject', '张明远')
    expect(r.ok).toBe(true)
    expect(created.status).toBe('rejected')
  })

  it('decideResignationRequest：批准后成员进入 exiting、职位结束并写辞职 tenure', () => {
    // mem-101 属 club-002，未被其他流程使用
    const created = createResignationRequest('club-002', 'mem-101', '张明远', '嵌入式组', '人事', '毕业离校')
    const r = decideResignationRequest(created.id, 'approve', '系统')
    expect(r.ok).toBe(true)
    expect(created.status).toBe('approved')

    const member = findMember('club-002', 'mem-101')!
    expect(member.status).toBe('exiting')
    expect(member.positions.every((p) => p.status !== 'active')).toBe(true)
    expect(member.tenures[0]).toMatchObject({ title: '人事', endReason: '辞职' })

    // 已处理不可重复操作
    expect(decideResignationRequest(created.id, 'approve', '系统')).toMatchObject({ ok: false, error: '该申请已处理' })
    expect(decideResignationRequest('res-ghost', 'approve', '系统')).toMatchObject({ ok: false, error: '申请不存在' })
  })
})

/**
 * ORG-001/017 审计：任命/免职/调岗/辞职执行后必须同步职位 Group 成员（Group 为关系权威，positions 不得独立于 Group 变动）。
 * mem-005（已退出，无 active 职位，未被其他流程使用）作为干净对象验证完整闭环。
 */
describe('职位 Group 成员同步（ORG-001/017）', () => {
  it('任命负责人写入负责人职位 Group；免职后移除', () => {
    const appointed = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'mem-005', memberName: '刘子豪', departmentId: 'dept-001', departmentName: '技术部', title: '负责人', scheduledAt: null, actorName: '系统' })
    executeAppointmentCommand(appointed.command!.id)
    expect(executeAppointmentCommand(appointed.command!.id).ok).toBe(true)
    expect(getGroupDetail('grp-lead-001')!.members.some((m) => m.id === 'mem-005')).toBe(true)

    const dismissed = createAppointmentCommand('club-001', { action: 'dismiss', memberId: 'mem-005', memberName: '刘子豪', departmentId: null, departmentName: null, title: null, scheduledAt: null, actorName: '系统' })
    executeAppointmentCommand(dismissed.command!.id)
    expect(executeAppointmentCommand(dismissed.command!.id).ok).toBe(true)
    expect(getGroupDetail('grp-lead-001')!.members.some((m) => m.id === 'mem-005')).toBe(false)
  })

  it('任命部门职位：部门 Group 下自动建职位 Group 并写入成员', () => {
    const appointed = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'mem-005', memberName: '刘子豪', departmentId: 'dept-001', departmentName: '技术部', title: '干事', scheduledAt: null, actorName: '系统' })
    executeAppointmentCommand(appointed.command!.id)
    expect(executeAppointmentCommand(appointed.command!.id).ok).toBe(true)
    // searchGroups 仅暴露社团级候选（SM-ORG-001），职位 Group 通过 syncPositionMembership 的返回 groupId 定位（幂等复用既有组）
    const synced = syncPositionMembership({ clubId: 'club-001', memberId: 'mem-005', memberName: '刘子豪', departmentName: '技术部', title: '干事', active: true })
    expect(synced.ok).toBe(true)
    expect(synced.groupId).toBeTruthy()
    expect(getGroupDetail(synced.groupId!)!.members.some((m) => m.id === 'mem-005')).toBe(true)
  })

  it('调岗：移出原职位 Group、写入新职位 Group', () => {
    // 前置：先任命 mem-005 为「技术部/干事」入组（独立可运行）
    const pre = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'mem-005', memberName: '刘子豪', departmentId: 'dept-001', departmentName: '技术部', title: '干事', scheduledAt: null, actorName: '系统' })
    executeAppointmentCommand(pre.command!.id)
    expect(executeAppointmentCommand(pre.command!.id).ok).toBe(true)
    const oldGroup = syncPositionMembership({ clubId: 'club-001', memberId: 'mem-005', memberName: '刘子豪', departmentName: '技术部', title: '干事', active: true })
    expect(oldGroup.ok).toBe(true)
    expect(oldGroup.groupId).toBeTruthy()
    expect(getGroupDetail(oldGroup.groupId!)!.members.some((m) => m.id === 'mem-005')).toBe(true)

    const transferred = createAppointmentCommand('club-001', { action: 'transfer', memberId: 'mem-005', memberName: '刘子豪', departmentId: 'dept-004', departmentName: '人事部', title: '部长', scheduledAt: null, actorName: '系统' })
    executeAppointmentCommand(transferred.command!.id)
    expect(executeAppointmentCommand(transferred.command!.id).ok).toBe(true)
    expect(getGroupDetail(oldGroup.groupId!)!.members.some((m) => m.id === 'mem-005')).toBe(false)
    // 人事部无部门 Group → 部长职位 Group 挂社团 Group 下
    const newGroup = syncPositionMembership({ clubId: 'club-001', memberId: 'mem-005', memberName: '刘子豪', departmentName: '人事部', title: '部长', active: true })
    expect(newGroup.ok).toBe(true)
    expect(newGroup.groupId).toBeTruthy()
    expect(getGroupDetail(newGroup.groupId!)!.members.some((m) => m.id === 'mem-005')).toBe(true)
  })

  it('辞职批准：同步移除职位 Group 成员（自带前置数据，不依赖调岗用例副作用）', () => {
    // 前置：it4 自行任命 mem-005 / mem-006 为「运营部部长」并入「部长」职位 Group，
    // 不再依赖 it3（调岗）或任命域用例的残留成员，具备独立可运行性。
    const appointed: string[] = []
    for (const m of [
      { memberId: 'mem-005', memberName: '刘子豪' },
      { memberId: 'mem-006', memberName: '林晓薇' },
    ]) {
      const created = createAppointmentCommand('club-001', {
        action: 'appoint', memberId: m.memberId, memberName: m.memberName, departmentId: 'dept-004', departmentName: '运营部', title: '部长', scheduledAt: null, actorName: '系统',
      })
      executeAppointmentCommand(created.command!.id)
      expect(executeAppointmentCommand(created.command!.id).ok).toBe(true)
      appointed.push(created.command!.id)
    }
    const synced = syncPositionMembership({ clubId: 'club-001', memberId: 'mem-005', memberName: '刘子豪', departmentName: '运营部', title: '部长', active: true })
    expect(synced.ok).toBe(true)
    expect(synced.groupId).toBeTruthy()
    const group = getGroupDetail(synced.groupId!)!
    expect(group.members.map((m) => m.id)).toEqual(expect.arrayContaining(['mem-005', 'mem-006']))

    // mem-006 辞职批准：移出「部长」职位 Group；mem-005 仍保留——验证的是辞职同步结果而非调岗残留
    const req = createResignationRequest('club-001', 'mem-006', '林晓薇', '运营部', '部长', '毕业离校')
    expect(decideResignationRequest(req.id, 'approve', '系统').ok).toBe(true)
    const detail = getGroupDetail(synced.groupId!)!
    expect(detail.members.some((m) => m.id === 'mem-006')).toBe(false)
    expect(detail.members.some((m) => m.id === 'mem-005')).toBe(true)
    // 未因承诺而退让 mem-006 之外的组外成员
    expect(appointed).toHaveLength(2)
  })

  it('同步失败留痕：负责人 Group 配置悬空时任命 ok 但 cmd.syncWarning 与 groupSyncTraces 记录「职位已写入、Group 未同步」', () => {
    const access = clubAccesses.find((c) => c.clubId === 'club-001')!
    const prevLeader = access.leaderGroupId
    access.leaderGroupId = 'grp-lead-ghost'
    try {
      const created = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'mem-005', memberName: '刘子豪', departmentId: 'dept-001', departmentName: '技术部', title: '负责人', scheduledAt: null, actorName: '系统' })
      executeAppointmentCommand(created.command!.id)
      const retry = executeAppointmentCommand(created.command!.id)
      expect(retry.ok).toBe(true)
      expect(retry.command?.syncWarning).toBe('负责人职位 Group 不存在或已失效')
      expect(groupSyncTraces[0]).toMatchObject({ clubId: 'club-001', memberId: 'mem-005', title: '负责人', active: true, error: '负责人职位 Group 不存在或已失效' })
      // 职位仍按任命写入（宽容语义），但留痕可观测补偿点
      expect(findMember('club-001', 'mem-005')!.positions.some((p) => p.title === '负责人' && p.status === 'active')).toBe(true)
    } finally {
      access.leaderGroupId = prevLeader
    }
  })

  it('辞职批准同步失败：req.syncWarning 与「职位已写入、Group 未移除」留痕一致（与任命路径同源）', () => {
    const access = clubAccesses.find((c) => c.clubId === 'club-001')!
    const prevLeader = access.leaderGroupId
    access.leaderGroupId = 'grp-lead-ghost'
    try {
      // 前置：就 mem-003 建立唯一活动职位「主席处/负责人」（避免与前序用例残留的 active 部门职位冲突）
      const appointed = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'mem-003', memberName: '李思颖', departmentId: 'dept-004', departmentName: '主席办', title: '负责人', scheduledAt: null, actorName: '系统' })
      executeAppointmentCommand(appointed.command!.id)
      expect(executeAppointmentCommand(appointed.command!.id).ok).toBe(true)
      const appointedPos = findMember('club-001', 'mem-003')!.positions.find((p) => p.departmentName === '主席办')!
      expect(appointedPos).toMatchObject({ title: '负责人', status: 'active' })

      // 辞职批准：清除对应职位 + 尝试移出职位 Group（leaderGroupId 悬空 → 留痕）
      const req = createResignationRequest('club-001', 'mem-003', '李思颖', '主席办', '负责人', '毕业离校')
      expect(decideResignationRequest(req.id, 'approve', '系统').ok).toBe(true)
      const approved = db.resignationRequests.find((r) => r.id === req.id)!
      expect(approved.status).toBe('approved')
      expect(approved.syncWarning).toBe('负责人职位 Group 不存在或已失效')
      expect(groupSyncTraces[0]).toMatchObject({ clubId: 'club-001', memberId: 'mem-003', title: '负责人', active: false, error: '负责人职位 Group 不存在或已失效' })
    } finally {
      access.leaderGroupId = prevLeader
    }
  })
})
