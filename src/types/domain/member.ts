/** 领域模型类型 - 成员生命周期 */

export interface Member {
  id: string
  clubId: string
  studentId: string
  name: string
  email: string
  phone: string
  status: MemberStatus
  positions: MemberPosition[]
  joinedAt: string
  exitedAt: string | null
}

export type MemberStatus = 'active' | 'suspended' | 'exiting' | 'exited' | 'removed' | 'rejoining'

export interface MemberPosition {
  id: string
  departmentId: string
  departmentName: string
  title: string
  startDate: string
  endDate: string | null
  status: 'active' | 'pending_confirmation' | 'transferring' | 'suspended' | 'ended'
}

export interface TenureRecord {
  id: string
  departmentName: string
  title: string
  startDate: string
  endDate: string | null
  endReason: string | null
}
