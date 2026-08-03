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
  /** 降级窗口起点（SRS-FAIL-001，15 分钟）。仅 degraded=true 时有效 */
  degradedSince?: string | null
  permissions: string[]
  workspace: WorkspaceInfo | null
}

export interface ProfileGate {
  complete: boolean
  emailVerified: boolean
}

/** 与 SM-IDN-003 资料同步状态词表一致（来源：state-machines/transitions.ts） */
export type ProfileSyncStatus =
  | 'synced'
  | 'pending_sync'
  | 'retrying'
  | 'pending_readback'
  | 'rolled_back'
  | 'conflict_pending'
