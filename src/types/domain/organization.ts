/** 领域模型类型 - 组织与授权 */

export type ClubRole = 'super_admin' | 'club_leader' | 'hr' | 'department_leader' | 'interviewer' | 'member' | 'applicant'

export interface Club {
  id: string
  name: string
  description: string
  logo: string | null
  memberCount: number
  status: 'active' | 'suspended' | 'archived'
}

/** SM-ORG-001 社团接入状态（唯一事实来源：transitions.ts） */
export type ClubAccessStatus = 'wizard_pending' | 'enabled' | 'suspended' | 'sync_abnormal_ro' | 'pending_rebind'

export type GroupPurpose = 'club' | 'department' | 'position'

/** Group 分层搜索命中（精确 → 中文连续子串 → 受控错别字近似） */
export type GroupMatchTier = 'exact' | 'substring' | 'fuzzy'

export interface GroupNode {
  id: string
  name: string
  stableId: string
  path: string
  parentId: string | null
  purpose: GroupPurpose
  boundClubId: string | null
  memberCount: number
}

export interface GroupSearchResult extends GroupNode {
  match: GroupMatchTier
  score: number
}

export interface ClubAccessItem {
  clubId: string
  clubName: string
  description: string
  status: ClubAccessStatus
  groupId: string | null
  groupName: string | null
  mappingVersion: number
  wizardStep: number
  leaderName: string | null
  memberCount: number
  createdAt: string
  boundAt: string | null
  importedCount: number
  /** 冻结时长累计顺延（毫秒），恢复时一次性并入 */
  freezeExtensionMs: number
  /** 异常/紧急停用期间空间只读 */
  readonly: boolean
  hasActiveBusiness: boolean
  syncEvents: { id: string; kind: string; at: string; note: string }[]
}

export interface ClubMembership {
  clubId: string
  clubName: string
  role: ClubRole
  permissions: string[]
  /** 当前用户在该社团的成员 id（成员生命周期自审/自操作判断）；无法解析时为 null */
  memberId?: string | null
}

export type WorkspaceContext = ClubMembership

export interface DashboardData {
  club: Pick<Club, 'id' | 'name'>
  role: ClubRole
  permissions: string[]
  todos: DashboardTodo[]
  recentActivities: Activity[]
}

export interface DashboardTodo {
  id: string
  type: string
  title: string
  count: number
}

export interface Activity {
  id: string
  clubId: string
  clubName: string
  title: string
  type: 'recruitment' | 'joint'
  status: string
  deadline?: string
  description?: string
}
