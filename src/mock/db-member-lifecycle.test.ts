/**
 * db.ts 成员生命周期补充测试（邀请/任命/部门申请/辞职/查询）。
 * 每个测试文件拥有独立模块实例（vitest isolate），种子数据与 db.test.ts 互不污染。
 * 各流程使用不同成员避免状态冲突：邀请→候选；任命→mem-002/003；部门申请→mem-001/003/006；辞职→mem-001。
 */
import { describe, expect, it, vi } from 'vitest'
import * as db from './db'
import { getGroupDetail, syncPositionMembership, clubAccesses, groupSyncTraces } from './db-organization'
import {
  cancelAppointmentCommand,
  confirmInvitationSync,
  countActiveLeaders,
  createAppointmentCommand,
  createDepartmentApplication,
  createExitRequest,
  createMembershipInvitation,
  createResignationRequest,
  decideDepartmentApplication,
  decideExitRequest,
  decideResignationRequest,
  confirmExitRequest,
  createMemberFromAdmission,
  directRemoveMember,
  markMemberExit,
  executeAppointmentCommand,
  executeDepartmentApplication,
  findMember,
  getMemberProfile,
  getMemberStats,
  hasPendingInvitation,
  historyMembershipsOf,
  isLastLeader,
  isProcessingOverdue,
  listInvitations,
  listMembers,
  memberManagerRole,
  members,
  respondInvitation,
  RECONCILE_DEDUP_MS,
  searchAppointmentCandidates,
  searchCandidates,
  triggerMemberExternalChange,
  upcomingTermEnd,
  withdrawDepartmentApplication,
  withdrawExitRequest,
  withdrawInvitation,
  withdrawResignationRequest,
} from './db'

describe('成员查询与统计', () => {
  it('searchCandidates：空关键字返回全部非成员；姓名子串/学号精确命中；已是成员者过滤', () => {
    const all = searchCandidates('club-001', '')
    // MEM-007：cand-005（历史成员重新加入）为非成员，纳入全部候选人
    expect(all.map((c) => c.id)).toEqual(['cand-001', 'cand-002', 'cand-003', 'cand-005'])
    expect(searchCandidates('club-001', '周').map((c) => c.id)).toEqual(['cand-001'])
    expect(searchCandidates('club-001', '20240011').map((c) => c.id)).toEqual(['cand-002'])
    // cand-004 已是成员，任何关键字下都不出现
    expect(all.some((c) => c.id === 'cand-004')).toBe(false)
    expect(searchCandidates('club-001', '陈雨桐').some((c) => c.id === 'cand-004')).toBe(false)
    // 历史成员重新加入：按学号定位到 cand-005 且带 previousMemberId（MEM-007 演示数据）
    const former = searchCandidates('club-001', '20240001')[0]
    expect(former).toMatchObject({ id: 'cand-005', previousMemberId: 'mem-005' })
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
    // 含 P3-1 新身份成员（mem-007 赵雨萌 / mem-008 孙雅静）
    expect(listMembers('club-001')).toHaveLength(8)
    expect(listMembers('club-002').map((m) => m.id)).toEqual(['mem-101'])
    expect(getMemberStats('club-001')).toEqual({ total: 8, active: 7, exited: 1 })
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

  it('triggerMemberExternalChange：成员级外部变更触发点留痕（P2-015，与社团级 triggerGroupLost 对称）', () => {
    const mem = members.find((m) => m.id === 'mem-001')!
    const before = mem.anomalies.length

    const r = triggerMemberExternalChange('club-001', 'mem-001')
    expect(r.ok).toBe(true)
    expect(r.data?.anomalies[0]).toMatchObject({ kind: 'external_change' })
    expect(members.find((m) => m.id === 'mem-001')!.anomalies.length).toBe(before + 1)

    // casdoor_mismatch 变体
    const r2 = triggerMemberExternalChange('club-001', 'mem-001', 'casdoor_mismatch')
    expect(r2.ok).toBe(true)
    expect(r2.data?.anomalies[0].kind).toBe('casdoor_mismatch')

    // 守卫：成员不存在 / 非活跃成员
    expect(triggerMemberExternalChange('club-001', 'mem-zzz')).toMatchObject({ ok: false, error: '未找到该成员' })
    expect(triggerMemberExternalChange('club-001', 'mem-005')).toMatchObject({ ok: false, error: '仅活跃成员可触发外部变更检测' })
  })

  it('triggerMemberExternalChange：批量触发 id 唯一 + 幂等去重（P2-017/015，同毫秒不再重复且同类不重复登记）', () => {
    const mem = members.find((m) => m.id === 'mem-001')!
    mem.anomalies.length = 0 // 隔离前置用例登记，保证确定性
    // 同类 external_change 连续 5 次：去重窗口内仅登记 1 条，后续 registered=false 幂等跳过
    let registered = 0
    for (let i = 0; i < 5; i++) {
      const r = triggerMemberExternalChange('club-001', 'mem-001')
      if (r.registered) registered += 1
      expect(r.ok).toBe(true)
    }
    expect(registered).toBe(1)
    const extIds = mem.anomalies.filter((a) => a.kind === 'external_change').map((a) => a.id)
    expect(extIds).toHaveLength(1)
    expect(extIds[0].startsWith('anm-')).toBe(true)

    // 不同 kind 不互相去重：casdoor_mismatch 仍可登记
    const r2 = triggerMemberExternalChange('club-001', 'mem-001', 'casdoor_mismatch')
    expect(r2.registered).toBe(true)

    // 重复 casdoor_mismatch 幂等跳过
    const r3 = triggerMemberExternalChange('club-001', 'mem-001', 'casdoor_mismatch')
    expect(r3.registered).toBe(false)

    // 同毫秒不同 kind 的 id 仍唯一（MemberProfilePage 以 an.id 作 v-for key）
    const ids = mem.anomalies.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('triggerMemberExternalChange：异常上限截断（超出 ANOMALY_MAX_KEEP 丢弃最旧，成员详情页不无限膨胀）', () => {
    const mem = members.find((m) => m.id === 'mem-001')!
    mem.anomalies.length = 0
    const kinds: ('casdoor_mismatch' | 'external_change')[] = ['casdoor_mismatch', 'external_change']
    // 用假定时器逐次推进，使每次触发都超出 30 天去重窗口 → 连续登记 30 条
    vi.useFakeTimers()
    try {
      for (let i = 0; i < 30; i++) {
        vi.setSystemTime(new Date(Date.now() + RECONCILE_DEDUP_MS + 1))
        triggerMemberExternalChange('club-001', 'mem-001', kinds[i % 2])
      }
    } finally {
      vi.useRealTimers()
    }
    expect(mem.anomalies.length).toBeLessThanOrEqual(20)
    expect(mem.anomalies.length).toBe(20)
    // 最旧记录被截断（unshift 保留最新）
    expect(mem.anomalies[0].createdAt >= mem.anomalies[mem.anomalies.length - 1].createdAt).toBe(true)
  })

  it('triggerMemberExternalChange：不同成员互相隔离（异常只登记在目标成员）', () => {
    const mem = members.find((m) => m.id === 'mem-001')!
    const other = members.find((m) => m.id === 'mem-002')!
    mem.anomalies.length = 0
    other.anomalies.length = 0
    const r = triggerMemberExternalChange('club-001', 'mem-001')
    expect(r.registered).toBe(true)
    expect(mem.anomalies).toHaveLength(1)
    expect(other.anomalies).toHaveLength(0)
  })
})

describe('主动退出流程（MEM-001：申请→审批→二次确认→离社，状态机 SM-MEM-001）', () => {
  it('createExitRequest 守卫：末位负责人/种子待审批占用/不存在/同人重复', () => {
    // mem-004 为 club-001 唯一现任负责人
    expect(createExitRequest('club-001', { memberId: 'mem-004', memberName: '张明远', reason: '交接' })).toMatchObject({ ok: false, error: '最后一名负责人不能无交接离社，请先安排交接' })
    // 种子 exit-req-002（mem-001 待审批，逾期演示）占用其申请名额
    expect(createExitRequest('club-001', { memberId: 'mem-001', memberName: '陈雨桐', reason: '重复' })).toMatchObject({ ok: false, error: '已有一份待处理的退出申请' })
    expect(createExitRequest('club-001', { memberId: 'mem-zzz', memberName: '谁', reason: 'x' })).toMatchObject({ ok: false, error: '成员不存在' })
    const created = createExitRequest('club-001', { memberId: 'mem-002', memberName: '王浩然', reason: '深造' })
    expect(created.ok).toBe(true)
    expect(created.request).toMatchObject({ status: 'under_review', dueAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) })
    expect(createExitRequest('club-001', { memberId: 'mem-002', memberName: '王浩然', reason: '重复' })).toMatchObject({ ok: false, error: '已有一份待处理的退出申请' })
    // 清理占用，供后续用例复用 mem-002
    expect(withdrawExitRequest(created.request!.id, 'mem-002').ok).toBe(true)
  })

  it('decideExitRequest：批准后成员进入 exiting 并结束全部职位、落主动退出 tenure', () => {
    const created = createExitRequest('club-001', { memberId: 'mem-002', memberName: '王浩然', reason: '深造' })!
    const reqId = created.request!.id
    // 自审拒绝
    expect(decideExitRequest(reqId, 'approve', { id: 'mem-002', name: '王浩然' })).toMatchObject({ ok: false, error: '不能审批自己的退出申请' })
    expect(decideExitRequest(reqId, 'approve', { id: 'user-hr-001', name: '李思颖' }).ok).toBe(true)
    const member = findMember('club-001', 'mem-002')!
    expect(member.status).toBe('exiting')
    expect(member.positions.every((p) => p.status !== 'active')).toBe(true)
    expect(member.tenures[0]).toMatchObject({ title: '副部长', endReason: '主动退出' })
    // 二次确认前不可重复审批
    expect(decideExitRequest(reqId, 'approve', { id: 'leader-2', name: '张明远' })).toMatchObject({ ok: false, error: '该申请已处理或已撤回，无法重复操作' })
  })

  it('confirmExitRequest：本人二次确认后正式离社（exiting → exited）', () => {
    // 入会桥建一个全新活跃成员，避免与其它成员（含种子待审批）状态互相污染
    const admitted = createMemberFromAdmission('club-001', { studentId: '29990001', name: '测试新人', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(admitted.ok).toBe(true)
    const memId = admitted.member!.id
    const created = createExitRequest('club-001', { memberId: memId, memberName: '测试新人', reason: '毕业' })!
    const reqId = created.request!.id
    decideExitRequest(reqId, 'approve', { id: 'leader-hr', name: '张明远' })
    // 非本人确认拒绝
    expect(confirmExitRequest(reqId, 'mem-001')).toMatchObject({ ok: false, error: '只能确认自己的退出申请' })
    const confirmed = confirmExitRequest(reqId, memId)
    expect(confirmed.ok).toBe(true)
    expect(confirmed.request?.status).toBe('exited')
    const member = findMember('club-001', memId)!
    expect(member.status).toBe('exited')
    expect(member.exitedAt).toBeTruthy()
    // 已确认不可重复
    expect(confirmExitRequest(reqId, memId)).toMatchObject({ ok: false, error: '仅已批准的退出申请可二次确认' })
  })

  it('withdrawExitRequest：审批前撤回，成员保持在职', () => {
    const created = createExitRequest('club-001', { memberId: 'mem-003', memberName: '李思颖', reason: '转校' })!
    const reqId = created.request!.id
    expect(withdrawExitRequest(reqId, 'mem-001')).toMatchObject({ ok: false, error: '只能撤回自己的退出申请' })
    expect(withdrawExitRequest(reqId, 'mem-003').ok).toBe(true)
    expect(findMember('club-001', 'mem-003')!.status).toBe('active')
    expect(withdrawExitRequest(reqId, 'mem-003')).toMatchObject({ ok: false, error: '仅待审批的退出申请可撤回' })
  })

  it('驳回退出申请：reject 后成员保持在职且可重新申请', () => {
    const created = createExitRequest('club-001', { memberId: 'mem-003', memberName: '李思颖', reason: '想退出' })!
    const reqId = created.request!.id
    expect(decideExitRequest(reqId, 'reject', { id: 'leader-x', name: '张明远' }).ok).toBe(true)
    expect(created.request?.status).toBe('rejected')
    expect(findMember('club-001', 'mem-003')!.status).toBe('active')
    // 驳回后重新申请通过
    const again = createExitRequest('club-001', { memberId: 'mem-003', memberName: '李思颖', reason: '再次退出' })
    expect(again.ok).toBe(true)
  })
})

describe('辞职/部门申请撤回与互斥（MEM-002）', () => {
  it('withdrawResignationRequest：仅本人、仅审批前，撤回不触碰职位', () => {
    const created = createResignationRequest('club-001', 'mem-003', '李思颖', '人事部', '部长', '家庭原因')
    expect(withdrawResignationRequest(created.id, 'mem-001')).toMatchObject({ ok: false, error: '只能撤回自己的辞职申请' })
    expect(withdrawResignationRequest(created.id, 'mem-003').ok).toBe(true)
    const member = findMember('club-001', 'mem-003')!
    expect(member.status).toBe('active')
    expect(created.status).toBe('withdrawn')
    expect(withdrawResignationRequest(created.id, 'mem-003')).toMatchObject({ ok: false, error: '仅待审批的辞职申请可撤回' })
  })

  it('isProcessingOverdue：处理态且超过 dueAt 即逾期，终态清理不标逾期', () => {
    // 已生效态（under_review 处理中 via createResignationRequest with 默认 3 天 → 未逾期）
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const past = new Date(Date.now() - 1000 * 60 * 60).toISOString()
    expect(isProcessingOverdue('under_review', past, ['under_review'])).toBe(true)
    expect(isProcessingOverdue('under_review', future, ['under_review'])).toBe(false)
    expect(isProcessingOverdue('rejected', past, ['under_review'])).toBe(false)
    expect(isProcessingOverdue('approved', past, ['under_review', 'approved'])).toBe(true)
  })

  it('withdrawDepartmentApplication：走状态机且与审批互斥——先审批则撤回失败', () => {
    const created = createDepartmentApplication('club-001', { applicantId: 'mem-001', applicantName: '陈雨桐', type: 'join', currentDept: '', targetDeptId: 'dept-002', reason: '想转运营' })
    const appId = created.id
    // 非本人撤回拒绝
    expect(withdrawDepartmentApplication(appId, 'mem-003')).toMatchObject({ ok: false, error: '只能撤回自己的申请' })
    // 先审批后撤回 → 互斥锁定
    decideDepartmentApplication(appId, 'approve', 'user-hr-001', '李思颖')
    expect(withdrawDepartmentApplication(appId, 'mem-001')).toMatchObject({ ok: false, error: '该申请已处理或已撤回，无法重复操作' })
    // 撤回自身可顺利完成（管理端代撤不影响互斥；重复撤回被锁）
    const created2 = createDepartmentApplication('club-001', { applicantId: 'mem-001', applicantName: '陈雨桐', type: 'join', currentDept: '', targetDeptId: 'dept-003', reason: '设计' })
    expect(withdrawDepartmentApplication(created2.id, 'mem-001').ok).toBe(true)
    expect(withdrawDepartmentApplication(created2.id, 'mem-001', true)).toMatchObject({ ok: false, error: '该申请已处理或已撤回，无法重复操作' })
  })
})

describe('任期到期提醒（MEM-004）', () => {
  it('upcomingTermEnd：仅统计 advanceDays 窗口内的在职在任职位，含 daysLeft 排序（时钟无关）', () => {
    // 动态构造相对当前时间的任期，避免硬编码日期（2026-08-20 等）随真实时钟过期后 CI 必挂
    const dayMs = 24 * 60 * 60 * 1000
    const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10)
    const freshMember = (id: string, name: string, plannedEndDate: string | null, status: 'active' | 'ended' = 'active') =>
      db.members.push({
        id, clubId: 'club-001', studentId: '20' + id.slice(-5), name,
        email: id + '@example.edu.cn', phone: '13800000000',
        status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
        positions: [{ id: 'pos-' + id, departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, plannedEndDate, status: status as 'active' | 'ended' }],
        tenures: [], departmentHistory: [], anomalies: [],
      }) as unknown as void
    // 30 天内到期 → 窗口内命中；300 天后到期 → 窗口外；已 ended → 不参与
    freshMember('mem-t0', '更近任期', iso(5))
    freshMember('mem-t1', '近任期', iso(1))
    freshMember('mem-t2', '远任期', iso(300))
    freshMember('mem-t3', '已结束', iso(10), 'ended')
    try {
      const hits = upcomingTermEnd('club-001', 30)
      expect(hits.some((h) => h.memberId === 'mem-t0')).toBe(true)
      expect(hits.some((h) => h.memberId === 'mem-t1')).toBe(true)
      expect(hits.some((h) => h.memberId === 'mem-t2')).toBe(false)
      expect(hits.some((h) => h.memberId === 'mem-t3')).toBe(false)
      // 宽窗口覆盖更远任期
      const wide = upcomingTermEnd('club-001', 2000)
      expect(wide.some((h) => h.memberId === 'mem-t2' && h.daysLeft > 30)).toBe(true)
      // daysLeft 升序（近任期在前）：种子数据里 mem-004（2026-08-20 到期）等成员可能随
      // 真实时钟进入同一窗口并与 mem-t1 并列，故只断言全局升序性质，不绑定具体成员位次
      for (let i = 1; i < hits.length; i++) {
        expect(hits[i].daysLeft).toBeGreaterThanOrEqual(hits[i - 1].daysLeft)
      }
      expect(hits[0].daysLeft).toBeLessThanOrEqual(30)
      // 宽窗口内 mem-t1(10 天) 必须排在 mem-t2(300 天) 之前，用相对顺序断言避免依赖固定日期种子数据
      const wideOrder = wide.map((h) => h.memberId)
      expect(wideOrder.indexOf('mem-t1')).toBeGreaterThanOrEqual(0)
      expect(wideOrder.indexOf('mem-t1')).toBeLessThan(wideOrder.indexOf('mem-t2'))
    } finally {
      const ids = new Set(['mem-t0', 'mem-t1', 'mem-t2', 'mem-t3'])
      for (let i = members.length - 1; i >= 0; i--) {
        if (ids.has(members[i].id)) members.splice(i, 1)
      }
    }
  })
})

describe('组合任命支持非成员（MEM-003）', () => {
  it('searchAppointmentCandidates：非成员档案 + 在职成员统一检索，历史成员带 previousMemberId', () => {
    const r = searchAppointmentCandidates('club-001', '')
    expect(r.nonMembers.some((c) => c.id === 'cand-005' && c.previousMemberId === 'mem-005')).toBe(true)
    const kw = searchAppointmentCandidates('club-001', '20240001')
    expect(kw.nonMembers.map((c) => c.id)).toEqual(['cand-005'])
    // 在职成员并入候选池
    expect(r.members.some((m) => m.id === 'mem-001')).toBe(true)
  })

  it('createAppointmentCommand + execute：非成员任命经创建成员 + 写部门职位完成（组合操作）', () => {
    // 非成员仅支持 appoint，拒绝调岗/免职；必须带部门与职位
    expect(createAppointmentCommand('club-001', { action: 'transfer', memberId: 'cand-new:20240001', memberName: '刘子豪', departmentId: 'dept-001', departmentName: '技术部', title: '干事', scheduledAt: null, actorName: '系统', candidateStudentId: '20240001' })).toMatchObject({ ok: false, error: '非成员仅可发起任命，不支持调岗/免职' })
    const created = createAppointmentCommand('club-001', { action: 'appoint', memberId: 'cand-new:20240001', memberName: '刘子豪', departmentId: 'dept-001', departmentName: '技术部', title: '干事', scheduledAt: null, actorName: '系统', candidateStudentId: '20240001' })
    expect(created.ok).toBe(true)
    expect(created.command).toMatchObject({ candidateStudentId: '20240001', createMemberOnExecute: true })
    const cmdId = created.command!.id

    executeAppointmentCommand(cmdId) // 首败 → exec_failed
    const retry = executeAppointmentCommand(cmdId)
    expect(retry.ok).toBe(true)
    // 执行时创建了新成员（同学生号的历史成员 mem-005 已退出，不幂等复用）并写入部门职位
    const pushed = listMembers('club-001').find((m) => m.studentId === '20240001' && m.status === 'active')!
    expect(pushed).toBeTruthy()
    expect(pushed.positions.some((p) => p.departmentId === 'dept-001' && p.title === '干事' && p.status === 'active')).toBe(true)
  })
})

describe('移除成员与层级白名单（MEM-006）', () => {
  it('memberManagerRole：负责人/人事/部门负责人/普通成员分级', () => {
    expect(memberManagerRole('club-001', 'mem-004')).toBe('club_leader')
    expect(memberManagerRole('club-001', 'mem-006')).toBe('department_leader')
    expect(memberManagerRole('club-001', 'mem-001')).toBe('member')
  })

  it('directRemoveMember：自删/目标不存在/末位负责人守卫', () => {
    expect(directRemoveMember('club-001', 'mem-004', 'mem-004')).toMatchObject({ ok: false, error: '不能移除自己' })
    expect(directRemoveMember('club-001', 'mem-004', 'mem-zzz')).toMatchObject({ ok: false, error: '成员不存在' })
    // 唯一现任负责人不可被移除（他人操作命中末位负责人守卫）
    expect(directRemoveMember('club-001', 'mem-001', 'mem-004')).toMatchObject({ ok: false, error: '最后一名负责人不能无交接离社，请先安排交接' })
  })

  it('directRemoveMember：移除普通成员走状态机并写 tenure（active → exiting → exited）', () => {
    const r = directRemoveMember('club-001', 'mem-004', 'mem-006')
    expect(r.ok).toBe(true)
    const member = findMember('club-001', 'mem-006')!
    expect(member.status).toBe('exited')
    expect(member.exitedAt).toBeTruthy()
    expect(member.positions.every((p) => p.status !== 'active')).toBe(true)
    // 重复移除（目标已非 active）
    expect(directRemoveMember('club-001', 'mem-004', 'mem-006')).toMatchObject({ ok: false })
  })

  it('directRemoveMember：移除负责人需要另一名现任负责人（"另一个人"校验）', () => {
    // 只有 mem-004 一名负责人（无其他现任负责人 → hasOtherLeader=false 被拒，命中末位负责人守卫）
    const r = directRemoveMember('club-001', 'mem-001', 'mem-004')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/最后一名|另一名/)
  })
})

describe('标记退出 vs 移除语义（markMemberExit）', () => {
  // 直接 push 自定义 id 的成员，避免 createMemberFromAdmission 用 Date.now() 生成 id 在
  // 同毫秒内与前置用例碰撞（本文件共享模块状态且无 reset）
  function pushActiveMember(id: string, name: string, dept: string | null, title = '干事'): string {
    members.push({
      id, clubId: 'club-001', studentId: '20' + id, name,
      email: id + '@example.edu.cn', phone: '13800000000',
      status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
      positions: dept ? [{ id: 'pos-' + id, departmentId: 'dept-001', departmentName: dept, title, startDate: '2024-09-01', endDate: null, plannedEndDate: null, status: 'active' }] : [],
      tenures: [], departmentHistory: [], anomalies: [],
    })
    return id
  }

  it('markMemberExit：仅记 exitedAt，保留职位档案（软退出）', () => {
    const memId = pushActiveMember('mem-mx-01', '标记退出测试', '技术部')
    const r = markMemberExit('club-001', 'mem-004', memId)
    expect(r.ok).toBe(true)
    const member = findMember('club-001', memId)!
    expect(member.status).toBe('exited')
    expect(member.exitedAt).toBeTruthy()
    // 与移除不同：职位仍 active（不结束档案）
    expect(member.positions.every((p) => p.status === 'active')).toBe(true)
  })

  it('markMemberExit：自标/不存在/末位负责人守卫/非在职拒绝', () => {
    expect(markMemberExit('club-001', 'mem-004', 'mem-004')).toMatchObject({ ok: false, error: '不能标记自己退出' })
    expect(markMemberExit('club-001', 'mem-004', 'mem-zzz')).toMatchObject({ ok: false, error: '成员不存在' })
    expect(markMemberExit('club-001', 'mem-001', 'mem-004')).toMatchObject({ ok: false, error: '最后一名负责人不能无交接离社，请先安排交接' })
    // 非在职（exited）拒绝
    const memId = pushActiveMember('mem-mx-02', '非在职', null)
    markMemberExit('club-001', 'mem-004', memId)
    expect(markMemberExit('club-001', 'mem-004', memId)).toMatchObject({ ok: false, error: '仅在职成员可标记退出' })
  })

  it('markMemberExit：操作者白名单——部门负责人不能标记人事/负责人退出', () => {
    // mem-006 为部门负责人，mem-003 为人事 → 越级被拒
    expect(markMemberExit('club-001', 'mem-006', 'mem-003')).toMatchObject({ ok: false, error: /人事管理员只能由社团负责人移除|无权/ })
    expect(markMemberExit('club-001', 'mem-006', 'mem-004')).toMatchObject({ ok: false, error: /社团负责人只能由另一名现任负责人移除|无权/ })
  })
})

describe('allowSelfExit 配置接入（P2）', () => {
  function pushActiveMember(id: string, name: string): string {
    members.push({
      id, clubId: 'club-001', studentId: '20' + id, name,
      email: id + '@example.edu.cn', phone: '13800000000',
      status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
      positions: [{ id: 'pos-' + id, departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, plannedEndDate: null, status: 'active' }],
      tenures: [], departmentHistory: [], anomalies: [],
    })
    return id
  }

  it('allowSelfExit=false 时 createExitRequest 拒绝发起', () => {
    const memId = pushActiveMember('mem-as-01', '自退A')
    const blocked = createExitRequest('club-001', { memberId: memId, memberName: '自退A', reason: '深造', allowSelfExit: false })
    expect(blocked).toMatchObject({ ok: false, error: /不允许成员自行退出/ })
    // 默认缺省（true）可正常发起
    const ok = createExitRequest('club-001', { memberId: memId, memberName: '自退A', reason: '深造' })
    expect(ok.ok).toBe(true)
    withdrawExitRequest(ok.request!.id, memId)
  })

  it('withdrawExitRequest 仅审批前可撤回（canWithdraw 契约：approved 不可撤回）', () => {
    const memId = pushActiveMember('mem-as-02', '自退B')
    const created = createExitRequest('club-001', { memberId: memId, memberName: '自退B', reason: '深造' })!
    const reqId = created.request!.id
    decideExitRequest(reqId, 'approve', { id: 'leader-x', name: '张明远' })
    expect(withdrawExitRequest(reqId, memId)).toMatchObject({ ok: false, error: '仅待审批的退出申请可撤回' })
  })
})

describe('重新加入时间线（MEM-007）', () => {
  it('historyMembershipsOf：同学生账号的已退出成员分段返回，排除当前', () => {
    // 种子：mem-005 已退出（刘子豪 20240001）；当前活跃成员 mem-001 学号不同
    const history = listMembers('club-001').find((m) => m.id === 'mem-005')
    expect(history).toBeDefined()
    const hits = historyMembershipsOf('club-001', '20240001')
    expect(hits.some((h) => h.id === 'mem-005' && h.status === 'exited')).toBe(true)
    // 本人不列入历史
    expect(historyMembershipsOf('club-001', '20210005', 'mem-001').some((h) => h.id === 'mem-001')).toBe(false)
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
    // 前置：it4 自行任命 mem-005 为「运营部部长」并入「部长」职位 Group；
    // 辞职方用入会桥新建成员（避免与 MEM-006 移除流程共用 mem-006 导致状态污染），
    // 不再依赖 it3（调岗）或任命域用例的残留成员，具备独立可运行性。
    const admitted = createMemberFromAdmission('club-001', { studentId: '28880001', name: '测试新人', departmentId: null, departmentName: null, acceptedAt: new Date().toISOString() })
    expect(admitted.ok).toBe(true)
    const freshId = admitted.member!.id
    const appointed: string[] = []
    for (const m of [
      { memberId: 'mem-005', memberName: '刘子豪' },
      { memberId: freshId, memberName: '测试新人' },
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
    expect(group.members.map((m) => m.id)).toEqual(expect.arrayContaining(['mem-005', freshId]))

    // 新建成员辞职批准：移出「部长」职位 Group；mem-005 仍保留——验证的是辞职同步结果而非调岗残留
    const req = createResignationRequest('club-001', freshId, '测试新人', '运营部', '部长', '毕业离校')
    expect(decideResignationRequest(req.id, 'approve', '系统').ok).toBe(true)
    const detail = getGroupDetail(synced.groupId!)!
    expect(detail.members.some((m) => m.id === freshId)).toBe(false)
    expect(detail.members.some((m) => m.id === 'mem-005')).toBe(true)
    // 未因承诺而退让 freshId 之外的组外成员
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
