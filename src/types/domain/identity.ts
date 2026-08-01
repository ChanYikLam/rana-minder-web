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

export interface WorkspaceInfo {
  clubId: string
  clubName: string
  role: import('./organization').ClubRole
  /** 当前用户在该社团的成员 id（用于成员生命周期页面自审/自操作判断） */
  memberId?: string
}

export interface SessionInfo {
  user: User
  profileGate: ProfileGate
  degraded: boolean
  permissions: string[]
  workspace: WorkspaceInfo | null
}

export interface ProfileGate {
  complete: boolean
  emailVerified: boolean
}

export type ProfileSyncStatus = 'synced' | 'syncing' | 'sync_failed' | 'conflict_pending' | 'conflict_resolved'
