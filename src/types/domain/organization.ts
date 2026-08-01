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

export interface ClubMembership {
  clubId: string
  clubName: string
  role: ClubRole
  permissions: string[]
}

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
