import { beforeEach, describe, expect, it } from 'vitest'

import {
  clubAccesses,
  getTemplateMappings,
  completeWizard,
  disconnectClub,
  recoverClub,
  suspendClub,
  reaccessClub,
  clearTemplateMappings,
  createClubAccess,
  saveWizardStep,
  resetOrgDb,
  triggerGroupLost,
  type MockClubAccess,
} from './db-organization'

/**
 * P1-005 模板映射生命周期测试：
 * - 种子数据预置 club-001/002 默认映射
 * - completeWizard / recoverClub / reaccessClub / rebindClub 自动建立映射（幂等）
 * - disconnectClub 清除映射
 * - createClubAccess 存储向导选择的 dept/role Group ID
 */
describe('P1-005 Group→Template 映射生命周期', () => {
  beforeEach(() => {
    resetOrgDb()
  })

  it('种子数据为 club-001/002 预置负责人/主 Group 映射，且与模板 ID 一致', () => {
    const m001 = getTemplateMappings('club-001')
    const m002 = getTemplateMappings('club-002')

    // club-001 预置主 Group + 负责人 + 部门映射
    expect(m001.map((m) => m.groupId)).toEqual(expect.arrayContaining(['grp-001', 'grp-lead-001', 'grp-dept-001']))
    expect(m001.find((m) => m.groupId === 'grp-dept-001')?.templateId).toBe('tpl-003')
    // 负责人 → tpl-001；主 Group（普通成员）→ tpl-002，避免越级
    expect(m001.find((m) => m.groupId === 'grp-lead-001')?.templateId).toBe('tpl-001')
    expect(m001.find((m) => m.groupId === 'grp-001')?.templateId).toBe('tpl-002')

    // club-002 预置主 Group + 负责人映射
    expect(m002.map((m) => m.groupId)).toEqual(expect.arrayContaining(['grp-002', 'grp-lead-002']))
    expect(m002.find((m) => m.groupId === 'grp-002')?.templateId).toBe('tpl-002')
    expect(m002.find((m) => m.groupId === 'grp-lead-002')?.templateId).toBe('tpl-001')
  })

  it('completeWizard 建立映射；状态机拒绝重复 complete，且不产生重复映射', () => {
    const club = clubAccesses.find((c) => c.clubId === 'club-004') as MockClubAccess
    // 模拟向导选择：主 Group + 负责人
    club.wizard = { selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-004', email: '', deptGroups: [], roleGroups: [], leaderRoleGroup: 'grp-lead-004' }
    club.leaderGroupId = 'grp-lead-004'
    club.deptGroupIds = []
    club.roleGroupIds = ['grp-lead-004']

    const r1 = completeWizard('club-004')
    expect(r1.ok).toBe(true)

    const afterFirst = getTemplateMappings('club-004')
    // 主 Group → tpl-002（普通成员，不授予负责人级权限）
    expect(afterFirst.some((m) => m.groupId === 'grp-004' && m.templateId === 'tpl-002')).toBe(true)
    expect(afterFirst.some((m) => m.groupId === 'grp-lead-004' && m.templateId === 'tpl-001')).toBe(true)

    // 状态机拒绝重复 complete（enabled 无 complete_validation 事件）
    const r2 = completeWizard('club-004')
    expect(r2.ok).toBe(false)
    const afterSecond = getTemplateMappings('club-004')
    expect(afterSecond.length).toBe(afterFirst.length)
  })

  it('enabled 状态可直接解除接入（修复前状态机死角：enabled 无 disconnect 事件，UI 死路）', () => {
    const before = getTemplateMappings('club-001')
    expect(before.length).toBeGreaterThan(0)

    const r = disconnectClub('club-001')
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({ status: 'pending_rebind', groupId: null, readonly: true })
    // 解除接入后映射清除（P1-005 生命周期闭环：正常启用社团也可走清除路径）
    expect(getTemplateMappings('club-001')).toEqual([])
  })

  it('disconnectClub 清除全部映射，reaccessClub 重新接入后重建映射', () => {
    // club-002 已启用；先触发 group_lost 进入 sync_abnormal_ro（该状态允许 disconnect）
    const lost = triggerGroupLost('club-002')
    expect(lost.ok).toBe(true)

    const before = getTemplateMappings('club-002')
    expect(before.length).toBeGreaterThan(0)

    const r = disconnectClub('club-002')
    expect(r.ok).toBe(true)
    expect(getTemplateMappings('club-002')).toEqual([])

    // 从待重新接入状态重新接入（reaccess_ok → suspended）并重建映射
    const r2 = reaccessClub('club-002', 'grp-002')
    expect(r2.ok).toBe(true)
    const rebuilt = getTemplateMappings('club-002')
    expect(rebuilt.some((m) => m.groupId === 'grp-002')).toBe(true)
  })

  it('recoverClub 恢复启用后重建/补充映射（幂等）', () => {
    // 先停用 club-001 再恢复，验证 recover 重建映射
    const s = suspendClub('club-001', 'normal', '审计停用', { hasActiveBusiness: false })
    expect(s.ok).toBe(true)
    clearTemplateMappings('club-001')
    expect(getTemplateMappings('club-001')).toEqual([])

    const r = recoverClub('club-001')
    expect(r.ok).toBe(true)
    const after = getTemplateMappings('club-001')
    expect(after.some((m) => m.groupId === 'grp-001')).toBe(true)
    expect(after.some((m) => m.groupId === 'grp-lead-001')).toBe(true)
  })

  it('createClubAccess 存储向导选择的 deptGroupIds / roleGroupIds', () => {
    const result = createClubAccess({
      groupId: 'grp-004',
      name: '审计测试社团',
      description: '测试',
      leaderGroupId: 'grp-lead-004',
      deptGroups: ['grp-dept-004'],
      roleGroups: ['grp-lead-004', 'grp-vice-004'],
      leaderRoleGroup: 'grp-lead-004',
    })
    expect(result.ok).toBe(true)

    const created = clubAccesses.find((c) => c.clubName === '审计测试社团')
    expect(created?.deptGroupIds).toEqual(['grp-dept-004'])
    expect(created?.roleGroupIds).toEqual(['grp-lead-004', 'grp-vice-004'])
  })

  it('普通职位 Group 映射 tpl-002（人事模板），不越级授予负责人权限（P2 修复）', () => {
    const result = createClubAccess({
      groupId: 'grp-004',
      name: '职位越级防护社',
      description: '测试',
      leaderGroupId: 'grp-lead-004',
      deptGroups: [],
      roleGroups: ['grp-lead-004', 'grp-vice-004'],
      leaderRoleGroup: 'grp-lead-004',
    })
    expect(result.ok).toBe(true)
    const club = clubAccesses.find((c) => c.clubName === '职位越级防护社')!
    const r = completeWizard(club.clubId)
    expect(r.ok).toBe(true)

    const mappings = getTemplateMappings(club.clubId)
    // 负责人 → tpl-001；副负责人（普通职位）→ tpl-002；主 Group → tpl-002
    expect(mappings.find((m) => m.groupId === 'grp-lead-004')?.templateId).toBe('tpl-001')
    expect(mappings.find((m) => m.groupId === 'grp-vice-004')?.templateId).toBe('tpl-002')
    expect(mappings.find((m) => m.groupId === 'grp-004')?.templateId).toBe('tpl-002')
  })

  it('saveWizardStep 携带 dept/role/leaderRoleGroup，completeWizard 后部门/职位映射齐全（P1 修复）', () => {
    const result = createClubAccess({
      groupId: 'grp-004',
      name: '向导完整流程社',
      description: '测试',
      leaderGroupId: 'grp-lead-004',
      deptGroups: [],
      roleGroups: [],
      leaderRoleGroup: '',
    })
    expect(result.ok).toBe(true)
    const clubId = (result.data as { clubId: string }).clubId

    // 管理页向导：save-step 逐步携带部门/职位/负责人引用（此前 ClubManagePage 不传，映射丢失）
    const step1 = saveWizardStep(clubId, { step: 1, selectedGroupId: 'grp-004' })
    expect(step1.ok).toBe(true)
    const step2 = saveWizardStep(clubId, { step: 2, selectedGroupId: 'grp-004', leaderGroupId: 'grp-lead-004', deptGroups: ['grp-dept-004'], roleGroups: ['grp-vice-004'], leaderRoleGroup: 'grp-lead-004' })
    expect(step2.ok).toBe(true)

    const r = completeWizard(clubId)
    expect(r.ok).toBe(true)

    const mappings = getTemplateMappings(clubId)
    expect(mappings.find((m) => m.groupId === 'grp-dept-004')?.templateId).toBe('tpl-003')
    expect(mappings.find((m) => m.groupId === 'grp-vice-004')?.templateId).toBe('tpl-002')
    expect(mappings.find((m) => m.groupId === 'grp-lead-004')?.templateId).toBe('tpl-001')
  })
})
