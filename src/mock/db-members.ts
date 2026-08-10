/**
 * 共享成员数据模块：消除 db.ts ↔ db-organization.ts 循环依赖
 * 提供 members 数组、MockMember 类型及相关基础查询，供 db.ts 和 db-organization.ts 共同引用
 */

export interface MockPosition {
  id: string
  departmentId: string
  departmentName: string
  title: string
  startDate: string
  endDate: string | null
  /** 计划任期结束时间（仅用于换届/到期提醒，不触发自动卸任，MEM-004/MEM-012） */
  plannedEndDate: string | null
  status: 'active' | 'pending_confirmation' | 'transferring' | 'suspended' | 'ended'
}

export interface MockTenure {
  id: string
  departmentName: string
  title: string
  startDate: string
  endDate: string | null
  endReason: string | null
}

export interface MockDeptHistoryEntry {
  id: string
  action: 'join' | 'leave' | 'transfer'
  departmentName: string
  at: string
}

export interface MockAnomaly {
  id: string
  kind: 'casdoor_mismatch' | 'external_change'
  message: string
  createdAt: string
}

export interface MockMember {
  id: string
  clubId: string
  studentId: string
  name: string
  email: string
  phone: string
  status: 'non_member' | 'pending_effective' | 'active' | 'exiting' | 'exited' | 'sync_anomaly'
  positions: MockPosition[]
  tenures: MockTenure[]
  departmentHistory: MockDeptHistoryEntry[]
  anomalies: MockAnomaly[]
  joinedAt: string
  exitedAt: string | null
}

export const members: MockMember[] = [
  {
    id: 'mem-001', clubId: 'club-001', studentId: '20210005',
    name: '陈雨桐', email: 'member@example.edu.cn', phone: '13800000005',
    status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-001', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, plannedEndDate: '2027-06-30', status: 'active' },
    ],
    tenures: [
      { id: 'ten-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-001', action: 'join', departmentName: '技术部', at: '2024-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-002', clubId: 'club-001', studentId: '20210004',
    name: '王浩然', email: 'wang@example.edu.cn', phone: '13800000004',
    status: 'active', joinedAt: '2023-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-002', departmentId: 'dept-001', departmentName: '技术部', title: '副部长', startDate: '2024-09-01', endDate: null, plannedEndDate: '2026-08-31', status: 'active' },
    ],
    tenures: [
      { id: 'ten-002', departmentName: '技术部', title: '干事', startDate: '2023-09-01', endDate: '2024-08-31', endReason: '任期结束' },
      { id: 'ten-003', departmentName: '技术部', title: '副部长', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-002', action: 'join', departmentName: '技术部', at: '2023-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-003', clubId: 'club-001', studentId: '20210003',
    name: '李思颖', email: 'hr@example.edu.cn', phone: '13800000003',
    status: 'active', joinedAt: '2023-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-003', departmentId: 'dept-004', departmentName: '人事部', title: '部长', startDate: '2024-09-01', endDate: null, plannedEndDate: '2026-09-30', status: 'active' },
    ],
    tenures: [
      { id: 'ten-004', departmentName: '人事部', title: '部长', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-003', action: 'join', departmentName: '人事部', at: '2023-09-01T10:00:00+08:00' },
    ],
    anomalies: [
      { id: 'anm-001', kind: 'casdoor_mismatch', message: 'Casdoor 侧部门与本地不一致，以 Casdoor 为准', createdAt: '2025-07-28T10:00:00+08:00' },
    ],
  },
  {
    id: 'mem-004', clubId: 'club-001', studentId: '20210002',
    name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002',
    status: 'active', joinedAt: '2022-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-004', departmentId: 'dept-001', departmentName: '技术部', title: '负责人', startDate: '2024-09-01', endDate: null, plannedEndDate: '2027-08-20', status: 'active' },
    ],
    tenures: [
      { id: 'ten-005', departmentName: '技术部', title: '负责人', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-004', action: 'join', departmentName: '技术部', at: '2022-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-006', clubId: 'club-001', studentId: '20210006',
    name: '林晓薇', email: 'deptleader@example.edu.cn', phone: '13800000007',
    status: 'active', joinedAt: '2022-09-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-006', departmentId: 'dept-001', departmentName: '技术部', title: '部长', startDate: '2024-09-01', endDate: null, plannedEndDate: null, status: 'active' },
    ],
    tenures: [
      { id: 'ten-007', departmentName: '技术部', title: '干事', startDate: '2022-09-01', endDate: '2023-08-31', endReason: '任期结束' },
      { id: 'ten-008', departmentName: '技术部', title: '副部长', startDate: '2023-09-01', endDate: '2024-08-31', endReason: '任期结束' },
      { id: 'ten-009', departmentName: '技术部', title: '部长', startDate: '2024-09-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-007', action: 'join', departmentName: '技术部', at: '2022-09-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-007', clubId: 'club-001', studentId: '20240201',
    name: '赵雨萌', email: 'incomplete@example.edu.cn', phone: '13800000021',
    status: 'active', joinedAt: '2025-09-01T00:00:00+08:00', exitedAt: null,
    positions: [],
    tenures: [],
    departmentHistory: [],
    anomalies: [],
  },
  {
    id: 'mem-008', clubId: 'club-001', studentId: '20240202',
    name: '孙雅静', email: 'unverified@example.edu.cn', phone: '13800000022',
    status: 'active', joinedAt: '2025-09-01T00:00:00+08:00', exitedAt: null,
    positions: [],
    tenures: [],
    departmentHistory: [],
    anomalies: [],
  },
  {
    id: 'mem-101', clubId: 'club-002', studentId: '20210002',
    name: '张明远', email: 'leader@example.edu.cn', phone: '13800000002',
    status: 'active', joinedAt: '2024-03-01T00:00:00+08:00', exitedAt: null,
    positions: [
      { id: 'pos-101', departmentId: 'dept-101', departmentName: '嵌入式组', title: '人事', startDate: '2024-03-01', endDate: null, plannedEndDate: null, status: 'active' },
    ],
    tenures: [
      { id: 'ten-101', departmentName: '嵌入式组', title: '人事', startDate: '2024-03-01', endDate: null, endReason: null },
    ],
    departmentHistory: [
      { id: 'dhis-101', action: 'join', departmentName: '嵌入式组', at: '2024-03-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
  {
    id: 'mem-005', clubId: 'club-001', studentId: '20240001',
    name: '刘子豪', email: 'former@example.edu.cn', phone: '13800000006',
    status: 'exited', joinedAt: '2023-09-01T00:00:00+08:00', exitedAt: '2024-06-01T00:00:00+08:00',
    positions: [
      { id: 'pos-005', departmentId: 'dept-001', departmentName: '技术部', title: '成员', startDate: '2023-09-01', endDate: '2024-06-01', plannedEndDate: null, status: 'ended' },
    ],
    tenures: [
      { id: 'ten-006', departmentName: '技术部', title: '成员', startDate: '2023-09-01', endDate: '2024-06-01', endReason: '主动退出' },
    ],
    departmentHistory: [
      { id: 'dhis-005', action: 'join', departmentName: '技术部', at: '2023-09-01T10:00:00+08:00' },
      { id: 'dhis-006', action: 'leave', departmentName: '技术部', at: '2024-06-01T10:00:00+08:00' },
    ],
    anomalies: [],
  },
]

export function listMembers(clubId: string): MockMember[] {
  return members.filter((m) => m.clubId === clubId)
}

export function getMemberStats(clubId: string): { total: number; active: number; exited: number } {
  const list = listMembers(clubId)
  return { total: list.length, active: list.filter((m) => m.status === 'active').length, exited: list.filter((m) => m.status === 'exited').length }
}