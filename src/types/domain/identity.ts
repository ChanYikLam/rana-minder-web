/** 领域模型类型 - 身份与资料 */

export interface User {
  id: string
  studentId: string
  name: string
  email: string
  phone: string
  avatar: string | null
  emailVerified: boolean
  profileComplete: boolean
}

export interface SessionInfo {
  user: User
  profileGate: ProfileGate
  degraded: boolean
  permissions: string[]
}

export interface ProfileGate {
  complete: boolean
  emailVerified: boolean
}

export type ProfileSyncStatus = 'synced' | 'syncing' | 'sync_failed' | 'conflict_pending' | 'conflict_resolved'
