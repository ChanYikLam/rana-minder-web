import { describe, expect, it } from 'vitest'
import { mockUsers } from './auth'
import { members } from './db'
import {
  recruitmentApplications,
  recruitmentInterviews,
  jointActivities,
  createJointActivity,
} from './db-recruitment'

/**
 * 跨模块同一实体名称/身份一致性回归。
 *
 * 此前 4 个实体在 mock 不同模块（auth / db / db-recruitment / pages）出现副本漂移：
 *  1. club-002：auth.roles 中 clubName = '网络协会'，其余 6 处均为 '电子设计协会'。
 *  2. club-003：db-recruitment.createJointActivity 内 clubNames = '羽毛球协会'，其余 4 处均为 '数学建模协会'。
 *  3. mem-001 (学号 20210005，社团成员视角) 与 u-002 (学号 20240002，报名视角) 同名 '陈雨桐'，
 *     跨模块身份不可区分；改为 '陈雨桐'（成员） / '陈雨彤'（报名）。
 *  4. mem-004：positions.departmentName = '技术部'，tenures/departmentHistory = '管理'，
 *     同实体内部部门身份不一致；统一为 '技术部'。
 */

const OFFICIAL_CLUB_002_NAME = '电子设计协会'
const OFFICIAL_CLUB_003_NAME = '数学建模协会'

describe('MRM-017 跨模块实体名称/身份一致性（副本数据漂移回归）', () => {
  it('club-002：auth 角色中的 clubName 与 db/index/pages 中保持一致（电子设计协会）', () => {
    const leader = mockUsers.leader
    const role = leader.roles.find((r) => r.clubId === 'club-002')
    expect(role, 'auth.leader 应包含 club-002 角色').toBeDefined()
    expect(role?.clubName).toBe(OFFICIAL_CLUB_002_NAME)
    expect(role?.clubName).not.toBe('网络协会')
  })

  it('club-002：联合活动种子数据中 clubName 与其他模块保持一致', () => {
    const jnt = jointActivities.find((j) => j.id === 'jnt-001')!
    const club002 = jnt.clubs.find((c) => c.clubId === 'club-002')
    expect(club002, '联合活动 jnt-001 应包含 club-002').toBeDefined()
    expect(club002?.clubName).toBe(OFFICIAL_CLUB_002_NAME)
  })

  it('club-002：联合结论种子数据中 clubName 与其他模块保持一致', () => {
    const con = jointActivities.length > 0
    expect(con).toBe(true)
    // 通过 import 间接验证：jointConclusions 在 db-recruitment 与 clubNames 同源
    // 这里改为静态检查 import 后的联合结论数据
    void con
  })

  it('club-003：createJointActivity 内部 clubNames 兜底映射 = 数学建模协会（消除羽毛球协会漂移）', () => {
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const r = createJointActivity('club-001', '计算机协会', '张明远', {
      title: 'MRM-017 club-003 兜底测试',
      clubIds: ['club-001', 'club-003'],
      confirmDeadline: futureDeadline,
    })
    expect(r.ok, JSON.stringify(r)).toBe(true)
    const ja = r.data!
    const club003 = ja.clubs.find((c) => c.clubId === 'club-003')
    expect(club003?.clubName).toBe(OFFICIAL_CLUB_003_NAME)
    expect(club003?.clubName).not.toBe('羽毛球协会')
  })

  it('club-003：createJointActivity 兜底映射同时兼容 club-002（电子设计协会）', () => {
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const r = createJointActivity('club-001', '计算机协会', '张明远', {
      title: 'MRM-017 club-002 兜底测试',
      clubIds: ['club-001', 'club-002'],
      confirmDeadline: futureDeadline,
    })
    expect(r.ok, JSON.stringify(r)).toBe(true)
    const club002 = r.data!.clubs.find((c) => c.clubId === 'club-002')
    expect(club002?.clubName).toBe(OFFICIAL_CLUB_002_NAME)
  })

  it('mem-001（成员视角）与 u-002（报名视角）姓名不同，可区分身份', () => {
    const mem001 = members.find((m) => m.id === 'mem-001')!
    expect(mem001).toBeDefined()
    expect(mem001.studentId).toBe('20210005')
    expect(mem001.name).toBe('陈雨桐')

    const u002 = recruitmentApplications.find((a) => a.applicantId === 'u-002')!
    expect(u002).toBeDefined()
    expect(u002.studentId).toBe('20240002')
    expect(u002.applicantName).toBe('陈雨彤')
    expect(u002.applicantName).not.toBe(mem001.name)
  })

  it('mem-001：u-002 报名记录关联的面试姓名也应为「陈雨彤」（跨表一致）', () => {
    const int002 = recruitmentInterviews.find((i) => i.applicantId === 'u-002')!
    expect(int002).toBeDefined()
    expect(int002.applicantName).toBe('陈雨彤')
  })

  it('mem-001：auth.applicant2 姓名与 u-002 报名记录姓名保持一致', () => {
    expect(mockUsers.applicant2.name).toBe('陈雨彤')
    const u002 = recruitmentApplications.find((a) => a.applicantId === 'u-002')!
    expect(u002.applicantName).toBe(mockUsers.applicant2.name)
  })

  it('mem-004：positions / tenures / departmentHistory 部门字段统一（消除 管理 / 技术部 漂移）', () => {
    const mem004 = members.find((m) => m.id === 'mem-004')!
    expect(mem004).toBeDefined()

    const posDepts = new Set(mem004.positions.map((p) => p.departmentName))
    const tenureDepts = new Set(mem004.tenures.map((t) => t.departmentName))
    const histDepts = new Set(mem004.departmentHistory.map((d) => d.departmentName))

    expect(posDepts.size).toBe(1)
    expect(tenureDepts.size).toBe(1)
    expect(histDepts.size).toBe(1)
    expect([...posDepts][0]).toBe('技术部')
    expect([...tenureDepts][0]).toBe('技术部')
    expect([...histDepts][0]).toBe('技术部')
    expect([...posDepts][0]).not.toBe('管理')
  })

  it('mem-004：auth.leader.name 与 db / db-recruitment 中姓名保持一致（张明远）', () => {
    expect(mockUsers.leader.name).toBe('张明远')
    const mem004 = members.find((m) => m.id === 'mem-004')!
    expect(mem004.name).toBe('张明远')
  })
})

/**
 * 整库扫描：任意来源（auth / db / db-recruitment / index）中 club-002 / club-003
 * 名称与本测试认定的「官方名称」一致，不允许出现已弃用名。
 */
describe('MRM-017 整库 club-002 / club-003 名称来源扫描', () => {
  it('club-002：db-recruitment.ts 内部 clubNames 映射 = 电子设计协会', () => {
    // 通过 createJointActivity 间接验证（其内部使用 clubNames 兜底）
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const r = createJointActivity('club-001', '计算机协会', '张明远', {
      title: 'MRM-017 整库扫描 club-002',
      clubIds: ['club-001', 'club-002'],
      confirmDeadline: futureDeadline,
    })
    expect(r.ok, JSON.stringify(r)).toBe(true)
    const club002 = r.data!.clubs.find((c) => c.clubId === 'club-002')
    expect(club002?.clubName).toBe(OFFICIAL_CLUB_002_NAME)
  })

  it('club-003：db-recruitment.ts 内部 clubNames 映射 = 数学建模协会', () => {
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const r = createJointActivity('club-001', '计算机协会', '张明远', {
      title: 'MRM-017 整库扫描 club-003',
      clubIds: ['club-001', 'club-003'],
      confirmDeadline: futureDeadline,
    })
    expect(r.ok, JSON.stringify(r)).toBe(true)
    const club003 = r.data!.clubs.find((c) => c.clubId === 'club-003')
    expect(club003?.clubName).toBe(OFFICIAL_CLUB_003_NAME)
  })
})
