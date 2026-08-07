/**
 * db-organization 测试：社团接入向导 + 停用体系。
 * 注意：模块持有内存单例（groups / clubAccesses），本文件用例按线性顺序执行，
 * 每个用例使用的社团互不冲突（club-004 向导 / club-001 停用-恢复-失权-重接 / club-005 修复 / club-002/003 兜底）。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  completeWizard,
  createClubAccess,
  disconnectClub,
  effectiveChars,
  getClubAccess,
  getGroupDetail,
  importMembers,
  listClubAccesses,
  reaccessClub,
  rebindClub,
  recoverClub,
  repairGroup,
  resetOrgDb,
  saveWizardStep,
  searchGroups,
  suspendClub,
  triggerGroupLost,
  validateGroupForBinding,
} from './db-organization'

describe('effectiveChars 有效字符门槛', () => {
  it('统计中文/字母/数字有效字符，忽略空白', () => {
    expect(effectiveChars('计算机协会')).toBe(5)
    expect(effectiveChars(' 摄影协会 ')).toBe(4)
    expect(effectiveChars('AB12')).toBe(4)
    expect(effectiveChars('')).toBe(0)
    expect(effectiveChars('  ')).toBe(0)
    expect(effectiveChars('!!@@')).toBe(0)
  })
})

describe('searchGroups 分层搜索', () => {
  it('空关键字返回空列表', () => {
    expect(searchGroups('')).toEqual([])
    expect(searchGroups('   ')).toEqual([])
  })

  it('精确命中名称：exact 层且带名称确定性排序', () => {
    const result = searchGroups('计算机协会')
    expect(result[0]).toMatchObject({ id: 'grp-001', match: 'exact', score: 1 })
    expect(result[0].stableId).toBe('G-COMP-CLUB')
  })

  it('精确命中稳定标识', () => {
    const result = searchGroups('G-COMP-CLUB')
    expect(result[0]).toMatchObject({ id: 'grp-001', match: 'exact' })
  })

  it('中文连续子串命中：substring 层，路径命中同样计入', () => {
    const result = searchGroups('协会')
    expect(result.length).toBeGreaterThanOrEqual(4)
    for (const item of result) {
      expect(item.match).toBe('substring')
      expect(item.score).toBe(0.8)
    }
  })

  it('错别字近似候选不超直接命中数：无直接命中时近似被裁剪为空', () => {
    // 受控近似：计算机协会 → 计算机邪会（编辑距离 1），但直接命中为 0 → 近似被裁剪
    expect(searchGroups('计算机邪会')).toEqual([])
  })

  it('不足 3 个有效字符不产生近似候选', () => {
    // 2 个字符关键字仅走精确/子串，无 fuzzy 层
    const result = searchGroups('摄影')
    for (const item of result) {
      expect(item.match).not.toBe('fuzzy')
    }
  })
})

describe('validateGroupForBinding 绑定约束', () => {
  it('未知 Group 拒绝', () => {
    expect(validateGroupForBinding('grp-zzz', 'club-x')).toMatchObject({ ok: false, error: '未找到该 Group' })
  })

  it('非 club 用途拒绝', () => {
    const result = validateGroupForBinding('grp-lead-001', 'club-x')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('仅 club 用途可绑定为社团')
  })

  it('已被其他社团绑定拒绝', () => {
    const result = validateGroupForBinding('grp-001', 'club-002')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('已被社团 club-001 绑定')
  })

  it('绑定到同一社团放行', () => {
    expect(validateGroupForBinding('grp-001', 'club-001')).toEqual({ ok: true })
  })

  it('未绑定且有父级的 club 用途 Group 可绑定', () => {
    expect(validateGroupForBinding('grp-004', 'club-x')).toEqual({ ok: true })
  })
})

describe('getGroupDetail / getClubAccess / listClubAccesses 查询', () => {
  it('getGroupDetail 返回成员与可用的负责人职位 Group（已绑定的负责人不出现）', () => {
    const detail = getGroupDetail('grp-004')!
    expect(detail.members.map((m) => m.id)).toEqual(['mem-401', 'mem-402', 'mem-403'])
    expect(detail.members.find((m) => m.id === 'mem-401')?.name).toBe('孙欣怡')
    // grp-lead-004 / grp-vice-004 是 grp-004 下未绑定的 position Group
    expect(detail.leaderGroups.map((g) => g.id).sort()).toEqual(['grp-lead-004', 'grp-vice-004'])
  })

  it('getGroupDetail 未知 Group 返回 null', () => {
    expect(getGroupDetail('grp-zzz')).toBeNull()
  })

  it('getClubAccess 按 clubId 返回接入记录', () => {
    expect(getClubAccess('club-001')).toMatchObject({ clubId: 'club-001', status: 'enabled', groupId: 'grp-001' })
    expect(getClubAccess('nope')).toBeUndefined()
  })

  it('listClubAccesses 按名称排序并携带派生字段', () => {
    const list = listClubAccesses()
    expect(list).toHaveLength(5)
    expect(list[0].clubName).toBe('电子设计协会')
    const club1 = list.find((c) => c.clubId === 'club-001')!
    expect(club1.groupName).toBe('计算机协会')
    expect(club1.freezeExtensionMs).toBe(0)
    expect(club1.hasActiveBusiness).toBe(false)
  })
})

describe('接入向导 saveWizardStep / importMembers / completeWizard（club-004）', () => {
  it('未知社团拒绝', () => {
    expect(saveWizardStep('nope', { step: 1 })).toMatchObject({ ok: false, error: '未找到该社团' })
  })

  it('非向导态社团保存步骤被状态机拒绝', () => {
    expect(saveWizardStep('club-001', { step: 1 })).toMatchObject({ ok: false })
  })

  it('保存步骤：步数钳制到 0-4，部分字段更新保留原值', () => {
    const r1 = saveWizardStep('club-004', { step: 99, selectedGroupId: 'grp-003' })
    expect(r1.ok).toBe(true)
    expect(r1.data?.wizardStep).toBe(4)

    const r2 = saveWizardStep('club-004', { step: -3 })
    expect(r2.data?.wizardStep).toBe(0)
    // 未传字段保留原值（wizard 内部状态）
    expect(getClubAccess('club-004')?.wizard?.selectedGroupId).toBe('grp-003')
  })

  it('importMembers：未选 Group 时拒绝', () => {
    const club = getClubAccess('club-004')!
    club.wizard!.selectedGroupId = null
    expect(importMembers('club-004', ['mem-201'])).toMatchObject({ ok: false, error: '请先选择要接入的 Group' })
  })

  it('importMembers：含 Group 外成员时整体拒绝', () => {
    saveWizardStep('club-004', { step: 2, selectedGroupId: 'grp-003' })
    expect(importMembers('club-004', ['mem-201', 'mem-999'])).toMatchObject({ ok: false, error: '存在不在该 Group 内的成员，导入被拒绝' })
  })

  it('importMembers：既有成员导入成功并更新计数', () => {
    const r = importMembers('club-004', ['mem-201', 'mem-202', 'mem-203'])
    expect(r.ok).toBe(true)
    expect(r.data?.importedCount).toBe(3)
    // 成员数为成员表单一数据源派生；导入仅记录并入历史，不向成员表造行
    expect(r.data?.memberCount).toBe(0)
  })

  it('completeWizard：非向导态被状态机拒绝', () => {
    expect(completeWizard('club-001')).toMatchObject({ ok: false })
  })

  it('completeWizard：未选 Group 拒绝', () => {
    const club = getClubAccess('club-004')!
    club.wizard!.selectedGroupId = null
    expect(completeWizard('club-004')).toMatchObject({ ok: false, error: '请先选择要接入的 Group' })
  })

  it('completeWizard：用途非法 / 重复绑定被约束拒绝', () => {
    saveWizardStep('club-004', { step: 3, selectedGroupId: 'grp-lead-004' })
    expect(completeWizard('club-004')).toMatchObject({ ok: false, error: expect.stringContaining('仅 club 用途可绑定为社团') })

    saveWizardStep('club-004', { step: 3, selectedGroupId: 'grp-001' })
    expect(completeWizard('club-004')).toMatchObject({ ok: false, error: expect.stringContaining('已被社团 club-001 绑定') })
  })

  it('completeWizard：负责人职位 Group 无有效负责人时拒绝', () => {
    // 非法层级绑定已在 save-step 阶段拒绝（wizard 不落库）；此处直接篡改 wizard 验证 complete 兜底复检
    const illegalStep = saveWizardStep('club-004', { step: 3, selectedGroupId: 'grp-004', leaderGroupId: 'grp-dept-001' })
    expect(illegalStep).toMatchObject({ ok: false, error: '负责人职位 Group 必须在所选社团层级下且为职位 Group' })

    const club = getClubAccess('club-004')!
    club.wizard = { ...club.wizard!, selectedGroupId: 'grp-004', leaderGroupId: 'grp-dept-001' }
    expect(completeWizard('club-004')).toMatchObject({ ok: false, error: '负责人职位 Group 内没有有效负责人，接入不可完成' })
  })

  it('completeWizard：校验通过后绑定 Group、写入负责人并进入 enabled', () => {
    saveWizardStep('club-004', { step: 4, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-004' })

    const r = completeWizard('club-004')

    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({
      clubId: 'club-004',
      status: 'enabled',
      groupId: 'grp-004',
      leaderName: '孙欣怡',
      memberCount: 0,
      readonly: false,
    })
    // 内部状态：负责人职位 Group 写入
    expect(getClubAccess('club-004')).toMatchObject({ leaderGroupId: 'grp-lead-004', mappingVersion: 1 })
    // 绑定生效：grp-004 不可再被其他社团绑定
    expect(validateGroupForBinding('grp-004', 'club-x')).toMatchObject({ ok: false })
  })
})

describe('停用体系：普通/紧急停用、恢复、失权、修复、重绑、重接', () => {
  it('普通停用被进行中业务阻止', () => {
    expect(suspendClub('club-001', 'normal', '重组', { hasActiveBusiness: true })).toMatchObject({
      ok: false,
      error: expect.stringContaining('存在进行中业务'),
    })
  })

  it('停用必须填写原因', () => {
    expect(suspendClub('club-001', 'normal', '  ', { hasActiveBusiness: false })).toMatchObject({
      ok: false,
      error: '停用必须填写原因',
    })
  })

  it('普通停用成功：进入 suspended、写入冻结区间与同步事件', () => {
    const r = suspendClub('club-001', 'normal', ' 组织架构调整 ', { hasActiveBusiness: false })
    expect(r.ok).toBe(true)
    expect(r.data?.status).toBe('suspended')
    expect(r.data?.readonly).toBe(true)

    const club = getClubAccess('club-001')!
    expect(club.freezeIntervals).toHaveLength(1)
    expect(club.freezeIntervals[0].reason).toBe('组织架构调整')
    expect(club.freezeIntervals[0].recoveredAt).toBeNull()
    expect(club.syncEvents[0].kind).toBe('suspend')
  })

  it('已停用社团再次紧急停用被状态机拒绝', () => {
    expect(suspendClub('club-001', 'force', '再停一次', { hasActiveBusiness: false })).toMatchObject({ ok: false })
  })

  it('紧急停用成功（enabled 社团）', () => {
    const r = suspendClub('club-002', 'force', '数据异常', { hasActiveBusiness: true })
    expect(r.ok).toBe(true)
    expect(r.data?.status).toBe('suspended')
  })

  it('恢复启用：冻结区间闭合并写同步事件', () => {
    const r = recoverClub('club-001')
    expect(r.ok).toBe(true)
    expect(r.data?.status).toBe('enabled')
    expect(r.data?.readonly).toBe(false)

    const club = getClubAccess('club-001')!
    expect(club.freezeIntervals[0].recoveredAt).not.toBeNull()
    expect(club.syncEvents[0].kind).toBe('recover')
  })

  it('非停用态恢复被状态机拒绝', () => {
    expect(recoverClub('club-004')).toMatchObject({ ok: false })
  })

  it('对账检测到 Group 失权：enabled → sync_abnormal_ro 只读', () => {
    const r = triggerGroupLost('club-001')
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({ status: 'sync_abnormal_ro', readonly: true })
    expect(r.data?.syncEvents[0].kind).toBe('group_lost')
  })

  it('已在同步异常态再次失权被状态机拒绝', () => {
    expect(triggerGroupLost('club-005')).toMatchObject({ ok: false })
  })

  it('解除接入：清空 Group/负责人绑定、向导复位并进入 pending_rebind', () => {
    const r = disconnectClub('club-001')
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({
      status: 'pending_rebind',
      groupId: null,
      leaderName: null,
      wizardStep: 0,
      readonly: true,
    })
    expect(r.data?.syncEvents[0].kind).toBe('disconnect')

    const club = getClubAccess('club-001')!
    expect(club.leaderGroupId).toBeNull()
    expect(club.wizard).toEqual({ selectedGroupId: null, leaderGroupId: null, email: '', deptGroups: [], roleGroups: [], leaderRoleGroup: '' })
    // 原 Group 解绑后可被其他社团重新绑定
    expect(validateGroupForBinding('grp-001', 'club-x')).toEqual({ ok: true })
  })

  it('suspended 态不可解除接入（状态机拒绝）', () => {
    expect(disconnectClub('club-003')).toMatchObject({ ok: false })
  })

  it('重新接入被占用的 Group 拒绝（pending_rebind 态直接走绑定校验）', () => {
    expect(reaccessClub('club-001', 'grp-002')).toMatchObject({ ok: false, error: expect.stringContaining('已被社团 club-002 绑定') })
  })

  it('重新接入：绑定新 Group 并统一先进入已停用', () => {
    const r = reaccessClub('club-001', 'grp-001')
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({ status: 'suspended', groupId: 'grp-001', readonly: false })
    expect(r.data?.syncEvents[0].kind).toBe('reaccess')
  })

  it('修复原 Group：sync_abnormal_ro → suspended', () => {
    const r = repairGroup('club-005')
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({ status: 'suspended', readonly: false })
    expect(r.data?.syncEvents[0].kind).toBe('repair')
  })

  it('suspended 态不可修复（状态机拒绝）', () => {
    expect(repairGroup('club-002')).toMatchObject({ ok: false })
  })

  it('重新绑定被占用的 Group 拒绝（仍处 sync_abnormal_ro 时直接走绑定校验）', () => {
    expect(triggerGroupLost('club-002').ok).toBe(true)
    expect(rebindClub('club-002', 'grp-001')).toMatchObject({ ok: false, error: expect.stringContaining('已被社团 club-001 绑定') })
  })

  it('重新绑定：sync_abnormal_ro → 绑定新 Group 后统一先进入已停用', () => {
    // completeWizard 用例已将 grp-004 绑定到 club-004，此处恢复种子快照后重建 sync_abnormal_ro 状态
    resetOrgDb()
    expect(triggerGroupLost('club-002').ok).toBe(true)
    const r = rebindClub('club-002', 'grp-004')
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({ status: 'suspended', groupId: 'grp-004' })
    expect(r.data?.syncEvents[0].kind).toBe('rebind')
  })

  it('importMembers 状态守卫：非向导/启用态拒绝导入', () => {
    expect(importMembers('club-003', ['mem-401'])).toMatchObject({ ok: false, error: '当前状态不可导入成员' })
  })

  it('恢复顺延：冻结期限按实际受阻时长计入 extension（club-003 种子停用 9 天）', () => {
    const r = recoverClub('club-003')
    expect(r.ok).toBe(true)
    const extension = listClubAccesses().find((c) => c.clubId === 'club-003')!.freezeExtensionMs
    expect(extension).toBeGreaterThan(8 * 24 * 60 * 60 * 1000)
  })
})

/** 审计修复：部门/职位/负责人职位 Group 引用写入校验（此前仅存储未校验，后续权限映射依赖该约束） */
describe('审计修复：部门/职位/负责人引用校验（createClubAccess / saveWizardStep）', () => {
  beforeEach(() => {
    resetOrgDb()
  })

  it('createClubAccess：部门 Group 必须位于所选社团层级下且为部门级', () => {
    const crossLevel = createClubAccess({ groupId: 'grp-004', name: '跨级部门社', description: '', leaderGroupId: 'grp-lead-004', deptGroups: ['grp-dept-001'] })
    expect(crossLevel.ok).toBe(false)
    expect(crossLevel.error).toContain('部门 Group 必须位于所选社团层级下')

    const wrongPurpose = createClubAccess({ groupId: 'grp-004', name: '错用途部门社', description: '', leaderGroupId: 'grp-lead-004', deptGroups: ['grp-lead-004'] })
    expect(wrongPurpose.ok).toBe(false)
    expect(wrongPurpose.error).toContain('部门 Group 必须位于所选社团层级下')
  })

  it('createClubAccess：职位 Group 必须位于所选社团层级下且为职位级', () => {
    const crossLevel = createClubAccess({ groupId: 'grp-004', name: '跨级职位社', description: '', leaderGroupId: 'grp-lead-004', roleGroups: ['grp-lead-001'] })
    expect(crossLevel.ok).toBe(false)
    expect(crossLevel.error).toContain('职位 Group 必须位于所选社团层级下')

    const wrongPurpose = createClubAccess({ groupId: 'grp-004', name: '错用途职位社', description: '', leaderGroupId: 'grp-lead-004', roleGroups: ['grp-dept-001'] })
    expect(wrongPurpose.ok).toBe(false)
    expect(wrongPurpose.error).toContain('职位 Group 必须位于所选社团层级下')
  })

  it('createClubAccess：leaderRoleGroup 引用必须为所选社团层级下的职位 Group', () => {
    const bad = createClubAccess({ groupId: 'grp-004', name: '错负责人引用社', description: '', leaderGroupId: 'grp-lead-004', leaderRoleGroup: 'grp-dept-001' })
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('负责人职位 Group 必须位于所选社团层级下')
  })

  it('createClubAccess：合法部门/职位/负责人引用通过并落库', () => {
    const good = createClubAccess({
      groupId: 'grp-004', name: '合法引用社', description: '',
      leaderGroupId: 'grp-lead-004', deptGroups: [], roleGroups: ['grp-lead-004'], leaderRoleGroup: 'grp-lead-004',
    })
    expect(good.ok).toBe(true)
    const stored = getClubAccess(good.data!.clubId)!
    expect(stored.wizard?.roleGroups).toEqual(['grp-lead-004'])
    expect(stored.wizard?.leaderRoleGroup).toBe('grp-lead-004')
  })

  it('saveWizardStep：写入部门/职位/负责人引用时同样校验层级与用途', () => {
    const created = createClubAccess({ groupId: 'grp-004', name: '回显校验社', description: '', leaderGroupId: 'grp-lead-004' })
    const id = created.data!.clubId

    const badDept = saveWizardStep(id, { step: 3, selectedGroupId: 'grp-004', deptGroups: ['grp-dept-001'] })
    expect(badDept.ok).toBe(false)
    expect(badDept.error).toContain('部门 Group 必须位于所选社团层级下')

    const badRole = saveWizardStep(id, { step: 3, selectedGroupId: 'grp-004', roleGroups: ['grp-dept-001'] })
    expect(badRole.ok).toBe(false)
    expect(badRole.error).toContain('职位 Group 必须位于所选社团层级下')

    // 未选 Group 时携带引用被拒，且非法写入不落库
    const noGroup = saveWizardStep(id, { step: 3, selectedGroupId: null, roleGroups: ['grp-lead-004'] })
    expect(noGroup.ok).toBe(false)
    expect(noGroup.error).toBe('请先选择要接入的 Group')
    expect(getClubAccess(id)?.wizard?.roleGroups).toEqual([])

    const good = saveWizardStep(id, { step: 3, selectedGroupId: 'grp-004', roleGroups: ['grp-lead-004'], leaderRoleGroup: 'grp-lead-004' })
    expect(good.ok).toBe(true)
    expect(getClubAccess(id)?.wizard?.roleGroups).toEqual(['grp-lead-004'])
    expect(getClubAccess(id)?.wizard?.leaderRoleGroup).toBe('grp-lead-004')
  })
})

/** 审计修复（第二轮）：联系方式兜底 / 导入语义 / disconnect 子 Group 清理 / search 仅社团级 / leaderRoleGroup 一致性 */
describe('审计修复：联系方式兜底、导入语义、子 Group 解绑、search 过滤、负责人引用一致性', () => {
  beforeEach(() => {
    resetOrgDb()
  })

  it('P2-2：importMembers 启用前导入只记 importedAt，不提前写 boundAt（绑定时间由 completeWizard 负责）', () => {
    saveWizardStep('club-004', { step: 2, selectedGroupId: 'grp-003' })
    const before = getClubAccess('club-004')!
    expect(before.boundAt).toBeNull()

    const r = importMembers('club-004', ['mem-201'])
    expect(r.ok).toBe(true)
    expect(r.data?.importedCount).toBe(1)
    expect(r.data?.importedAt).toBeTruthy()
    expect(r.data?.boundAt).toBeNull()
    expect(getClubAccess('club-004')?.syncEvents[0].kind).toBe('import')
  })

  it('P2-2：enabled 后补导成员保留既有绑定时间并新增 import 同步事件', () => {
    saveWizardStep('club-004', { step: 4, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-004' })
    const completed = completeWizard('club-004')
    expect(completed.ok).toBe(true)
    const boundAt = getClubAccess('club-004')?.boundAt
    expect(boundAt).toBeTruthy()

    const r = importMembers('club-004', ['mem-401'])
    expect(r.ok).toBe(true)
    expect(getClubAccess('club-004')?.boundAt).toBe(boundAt)
    expect(getClubAccess('club-004')?.importedAt).toBeTruthy()
    expect(getClubAccess('club-004')?.syncEvents[0].kind).toBe('import')
  })

  it('P3-1：disconnectClub 一并解绑部门/职位子 Group（不残留 boundClubId）', () => {
    // grp-dept-001（计算机协会技术部）种子绑定了 club-001；disconnect 需从 sync_abnormal_ro 出发
    expect(getGroupDetail('grp-001')?.departments.find((g) => g.id === 'grp-dept-001')?.boundClubId).toBe('club-001')
    expect(triggerGroupLost('club-001').ok).toBe(true)
    expect(disconnectClub('club-001').ok).toBe(true)
    const detail = getGroupDetail('grp-001')!
    expect(detail.departments.find((g) => g.id === 'grp-dept-001')?.boundClubId).toBeNull()
    expect(detail.leaderGroups.find((g) => g.id === 'grp-lead-001')?.boundClubId).toBeNull()
  })

  it('P3-2：searchGroups 仅返回社团级候选（不泄露部门/职位 Group）', () => {
    const result = searchGroups('技术部')
    expect(result.length).toBe(0)
    const byName = searchGroups('负责人')
    expect(byName.length).toBe(0)
    // 社团级仍可命中
    const clubHit = searchGroups('摄影协会')
    expect(clubHit.some((g) => g.purpose === 'club')).toBe(true)
    expect(clubHit.every((g) => g.purpose === 'club')).toBe(true)
  })

  it('P3-3：createClubAccess 负责人职位引用必须与负责人职位一致', () => {
    // grp-vice-004 层级合法（grp-004 下职位 Group）但与被选负责人不一致 → 拒绝
    const mismatch = createClubAccess({
      groupId: 'grp-004', name: '引用分裂社', description: '',
      leaderGroupId: 'grp-lead-004', leaderRoleGroup: 'grp-vice-004',
    })
    expect(mismatch.ok).toBe(false)
    expect(mismatch.error).toContain('负责人职位引用必须与负责人职位一致')
  })

  it('P3-3：saveWizardStep 负责人职位引用必须与负责人职位一致', () => {
    const created = createClubAccess({ groupId: 'grp-004', name: '保存引用分裂社', description: '', leaderGroupId: 'grp-lead-004' })
    const id = created.data!.clubId
    const bad = saveWizardStep(id, { step: 3, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-004', leaderRoleGroup: 'grp-vice-004' })
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('负责人职位引用必须与负责人职位一致')
  })
})
