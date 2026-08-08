/**
 * db-members.ts 共享成员模块专属直测（Issue #95）。
 * db-members.ts 是消除 db.ts ↔ db-organization.ts 运行时循环依赖而抽取的共享模块，
 * 此前仅由 db.test.ts / db-member-lifecycle.test.ts / db-organization.test.ts 等间接覆盖。
 * 本文件直接引用 db-members.ts，独立守护其类型、种子与基础查询契约，防止后续改动破坏底层数据。
 * 模块级数组为有状态单例，vitest 每个测试文件拥有独立模块实例（isolate），故无需 resetDb。
 */
import { describe, expect, it } from 'vitest'

import { members, listMembers, getMemberStats } from './db-members'
import type { MockMember } from './db-members'

describe('db-members 种子数据完整性', () => {
  it('种子成员按社团分布：club-001 8 人 / club-002 1 人（含 P3-1 新身份与历史退出成员）', () => {
    expect(members.length).toBe(9)
    expect(members.filter((m) => m.clubId === 'club-001')).toHaveLength(8)
    expect(members.filter((m) => m.clubId === 'club-002')).toHaveLength(1)
  })

  it('每个成员满足结构契约：必填字段非空、状态合法、职位/任期/履历/异常均为数组', () => {
    const validStatus = ['non_member', 'pending_effective', 'active', 'exiting', 'exited', 'sync_anomaly']
    const validPosStatus = ['active', 'pending_confirmation', 'transferring', 'suspended', 'ended']
    const validAction = ['join', 'leave', 'transfer']
    const validAnomalyKind = ['casdoor_mismatch', 'external_change']
    for (const m of members) {
      expect(m.id).toBeTruthy()
      expect(m.clubId).toBeTruthy()
      expect(m.studentId).toBeTruthy()
      expect(m.name).toBeTruthy()
      expect(m.email).toBeTruthy()
      expect(m.phone).toBeTruthy()
      expect(m.joinedAt).toBeTruthy()
      expect(validStatus).toContain(m.status)
      expect(Array.isArray(m.positions)).toBe(true)
      expect(Array.isArray(m.tenures)).toBe(true)
      expect(Array.isArray(m.departmentHistory)).toBe(true)
      expect(Array.isArray(m.anomalies)).toBe(true)
      for (const p of m.positions) {
        expect(p.id).toBeTruthy()
        expect(p.departmentId).toBeTruthy()
        expect(p.departmentName).toBeTruthy()
        expect(p.title).toBeTruthy()
        expect(p.startDate).toBeTruthy()
        expect(validPosStatus).toContain(p.status)
      }
      for (const t of m.tenures) {
        expect(t.id).toBeTruthy()
        expect(t.departmentName).toBeTruthy()
        expect(t.title).toBeTruthy()
        expect(t.startDate).toBeTruthy()
      }
      for (const h of m.departmentHistory) {
        expect(validAction).toContain(h.action)
        expect(h.departmentName).toBeTruthy()
        expect(h.at).toBeTruthy()
      }
      for (const a of m.anomalies) {
        expect(validAnomalyKind).toContain(a.kind)
        expect(a.message).toBeTruthy()
        expect(a.createdAt).toBeTruthy()
      }
    }
  })

  it('成员 id 全局唯一、同一社团内学号唯一（底层数据不重复）', () => {
    const ids = members.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const clubId of ['club-001', 'club-002']) {
      const studentIds = members.filter((m) => m.clubId === clubId).map((m) => m.studentId)
      expect(new Set(studentIds).size).toBe(studentIds.length)
    }
  })

  it('任期/职位状态一致性：exited 成员的 active 职位均已 ended，active 成员至少保留 1 个 active 职位', () => {
    for (const m of members) {
      if (m.status === 'exited' || m.status === 'sync_anomaly') {
        expect(m.positions.every((p) => p.status === 'ended')).toBe(true)
      } else if (m.positions.length > 0) {
        // 无职位成员（P3-1 新身份）不强制；有职位的在职成员须有 active 职位
        expect(m.positions.some((p) => p.status === 'active')).toBe(true)
      }
    }
  })
})

describe('db-members 基础查询', () => {
  it('listMembers：按社团过滤，返回成员数组副本语义', () => {
    expect(listMembers('club-001')).toHaveLength(8)
    expect(listMembers('club-002').map((m) => m.id)).toEqual(['mem-101'])
    expect(listMembers('club-003')).toHaveLength(0)
    // 结果与种子同一引用数组元素（供上层就地更新）
    const first = listMembers('club-001')[0]
    expect(members.includes(first)).toBe(true)
  })

  it('getMemberStats：按社团统计 total/active/exited（sync_anomaly 暂不纳入 exited 口径）', () => {
    expect(getMemberStats('club-001')).toEqual({ total: 8, active: 7, exited: 1 })
    expect(getMemberStats('club-002')).toEqual({ total: 1, active: 1, exited: 0 })
    expect(getMemberStats('club-003')).toEqual({ total: 0, active: 0, exited: 0 })
  })

  it('getMemberStats 与 listMembers 口径一致（total = list 长度）', () => {
    for (const clubId of ['club-001', 'club-002', 'club-003']) {
      const list = listMembers(clubId)
      const stats = getMemberStats(clubId)
      expect(stats.total).toBe(list.length)
    }
  })

  it('返回类型可被推导为 MockMember（类型契约可直接引用）', () => {
    const m: MockMember | undefined = listMembers('club-001').find((x) => x.id === 'mem-001')
    expect(m?.name).toBe('陈雨桐')
  })
})
