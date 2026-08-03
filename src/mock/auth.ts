/**
 * Mock 层多角色用户数据
 * 模拟不同角色登录后的会话和权限
 */

export interface MockUser {
  id: string
  studentId: string
  name: string
  email: string
  phone: string
  avatar: string | null
  roles: MockRole[]
  currentClubId: string | null
  emailVerified: boolean
  profileComplete: boolean
}

export interface MockRole {
  clubId: string
  clubName: string
  role: 'super_admin' | 'club_leader' | 'hr' | 'department_leader' | 'interviewer' | 'member' | 'applicant'
  permissions: string[]
}

/** 预定义的 mock 用户 */
export const mockUsers: Record<string, MockUser> = {
  /** 超级管理员 */
  admin: {
    id: 'user-admin-001',
    studentId: '20210001',
    name: '平台管理员',
    email: 'admin@example.edu.cn',
    phone: '13800000001',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: null,
    roles: [
      {
        clubId: '',
        clubName: '',
        role: 'super_admin',
        permissions: [
          'platform:club:manage',
          'platform:form:design',
          'platform:config:manage',
          'platform:audit:view',
          'platform:delete:execute',
          'platform:export:execute',
          'platform:ops:view',
        ],
      },
    ],
  },

  /** 社团负责人 */
  leader: {
    id: 'user-leader-001',
    studentId: '20210002',
    name: '张明远',
    email: 'leader@example.edu.cn',
    phone: '13800000002',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: 'club-001',
    roles: [
      {
        clubId: 'club-001',
        clubName: '计算机协会',
        role: 'club_leader',
        permissions: [
          'club:dashboard:view',
          'club:recruitment:manage',
          'club:joint:manage',
          'club:member:manage',
          'club:appointment:manage',
          'club:resignation:approve',
          'club:invite:manage',
          'club:transition:manage',
          'club:form:design',
          'club:stats:view',
          'club:export:execute',
          'club:audit:view',
          'club:config:manage',
          'club:batch:execute',
          'club:email:config',
        ],
      },
      {
        clubId: 'club-002',
        clubName: '网络协会',
        role: 'hr',
        permissions: [
          'club:dashboard:view',
          'club:recruitment:manage',
          'club:joint:manage',
          'club:member:manage',
          'club:appointment:manage',
          'club:resignation:approve',
          'club:invite:manage',
          'club:transition:manage',
          'club:stats:view',
          'club:export:execute',
          'club:audit:view',
          'club:config:manage',
          'club:batch:execute',
        ],
      },
    ],
  },

  /** 人事 */
  hr: {
    id: 'user-hr-001',
    studentId: '20210003',
    name: '李思颖',
    email: 'hr@example.edu.cn',
    phone: '13800000003',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: 'club-001',
    roles: [
      {
        clubId: 'club-001',
        clubName: '计算机协会',
        role: 'hr',
        permissions: [
          'club:dashboard:view',
          'club:recruitment:manage',
          'club:joint:manage',
          'club:member:manage',
          'club:appointment:manage',
          'club:resignation:approve',
          'club:invite:manage',
          'club:transition:manage',
          'club:form:design',
          'club:stats:view',
          'club:export:execute',
          'club:audit:view',
          'club:config:manage',
          'club:batch:execute',
        ],
      },
    ],
  },

  /** 面试官 */
  interviewer: {
    id: 'user-interviewer-001',
    studentId: '20210004',
    name: '王浩然',
    email: 'interviewer@example.edu.cn',
    phone: '13800000004',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: 'club-001',
    roles: [
      {
        clubId: 'club-001',
        clubName: '计算机协会',
        role: 'interviewer',
        permissions: [
          'club:interview:view',
          'club:interview:evaluate',
        ],
      },
    ],
  },

  /** 部门负责人（数据范围仅限本部门） */
  deptleader: {
    id: 'user-deptleader-001',
    studentId: '20210006',
    name: '林晓薇',
    email: 'deptleader@example.edu.cn',
    phone: '13800000007',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: 'club-001',
    roles: [
      {
        clubId: 'club-001',
        clubName: '计算机协会',
        role: 'department_leader',
        permissions: [
          'club:dashboard:view',
          'club:member:manage',
          'club:interview:view',
          'club:interview:evaluate',
          'club:stats:view',
          'club:export:execute',
        ],
      },
    ],
  },

  /** 普通成员 */
  member: {
    id: 'user-member-001',
    studentId: '20210005',
    name: '陈雨桐',
    email: 'member@example.edu.cn',
    phone: '13800000005',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: 'club-001',
    roles: [
      {
        clubId: 'club-001',
        clubName: '计算机协会',
        role: 'member',
        permissions: [
          'club:member:view-self',
        ],
      },
    ],
  },

  /** 申请人（未加入任何社团） */
  applicant: {
    id: 'user-applicant-001',
    studentId: '20240001',
    name: '刘子豪',
    email: 'applicant@example.edu.cn',
    phone: '13800000006',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: null,
    roles: [
      {
        clubId: '',
        clubName: '',
        role: 'applicant',
        permissions: [],
      },
    ],
  },

  /** 候选人（收到常规入社邀请待处理） */
  candidate: {
    id: 'user-candidate-001',
    studentId: '20240010',
    name: '周明轩',
    email: 'candidate@example.edu.cn',
    phone: '13800000010',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: null,
    roles: [
      {
        clubId: '',
        clubName: '',
        role: 'applicant',
        permissions: [],
      },
    ],
  },

  /** 第二申请人（受邀人 u-002 的操作者） */
  applicant2: {
    id: 'user-applicant-002',
    studentId: '20240002',
    name: '陈雨桐',
    email: 'applicant2@example.edu.cn',
    phone: '13800000002',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: null,
    roles: [
      {
        clubId: '',
        clubName: '',
        role: 'applicant',
        permissions: [],
      },
    ],
  },

  /** 第三申请人（联合受邀人 u-006 的操作者） */
  applicant3: {
    id: 'user-applicant-003',
    studentId: '20240006',
    name: '孙一凡',
    email: 'applicant3@example.edu.cn',
    phone: '13800000003',
    avatar: null,
    emailVerified: true,
    profileComplete: true,
    currentClubId: null,
    roles: [
      {
        clubId: '',
        clubName: '',
        role: 'applicant',
        permissions: [],
      },
    ],
  },
}

let activeMockUserKey: string | null = null

/** 演示登录身份目录（由 mockUsers 派生，MOCK 模式登录页按此渲染，避免与 mock 数据漂移） */
export interface DemoRoleInfo {
  key: string
  role: MockRole['role']
  label: string
  desc: string
}

const ROLE_LABELS: Record<MockRole['role'], string> = {
  super_admin: '超级管理员',
  club_leader: '社团负责人',
  hr: '人事',
  department_leader: '部门负责人',
  interviewer: '面试官',
  member: '普通成员',
  applicant: '申请人',
}

const ROLE_HINTS: Record<MockRole['role'], string> = {
  super_admin: '平台全局管理',
  club_leader: '社团管理全部功能',
  hr: '招新与成员管理',
  department_leader: '成员管理（仅本部门范围）',
  interviewer: '面试评价',
  member: '查看本人信息',
  applicant: '报名与查看邀请',
}

export const DEMO_ROLES: DemoRoleInfo[] = Object.entries(mockUsers).map(([key, u]) => {
  const role = u.roles[0]?.role ?? 'applicant'
  return {
    key,
    role,
    label: ROLE_LABELS[role],
    desc: u.roles[0]?.clubName ? `${ROLE_HINTS[role]} · ${u.roles[0].clubName}` : ROLE_HINTS[role],
  }
})

export function clearMockSession(): void {
  activeMockUserKey = null
}

export function getActiveMockUser(): MockUser | null {
  return activeMockUserKey ? mockUsers[activeMockUserKey] : null
}

/** 当前 mock 用户（可通过 URL 参数 ?_mock_user=leader 切换）
 * 带参请求（如登录后的 session 拉取）会锚定 activeMockUserKey，
 * 使后续不带参数的请求解析到同一登录角色，直到退出登录。 */
export function resolveMockUser(url: string): MockUser {
  try {
    const u = new URL(url, 'http://localhost')
    const requested = u.searchParams.get('_mock_user')
    if (requested && mockUsers[requested]) {
      activeMockUserKey = requested
    }
    const key = requested || activeMockUserKey || 'leader'
    return mockUsers[key] || mockUsers.leader
  } catch {
    return mockUsers.leader
  }
}

/** 获取当前用户在某社团的权限列表 */
export function getPermissions(user: MockUser, clubId: string): string[] {
  if (!clubId) {
    // 超管返回平台权限
    const superRole = user.roles.find((r) => r.role === 'super_admin')
    return superRole?.permissions || []
  }
  const role = user.roles.find((r) => r.clubId === clubId)
  return role?.permissions || []
}

/** mock 用户 id → 社团成员 id（成员生命周期以成员视角模拟操作者） */
export const USER_MEMBER_MAP: Record<string, string> = {
  'user-leader-001': 'mem-004',
  'user-hr-001': 'mem-003',
  'user-interviewer-001': 'mem-002',
  'user-member-001': 'mem-001',
  'user-deptleader-001': 'mem-006',
}

/** 获取当前用户的默认工作空间（有社团归属时返回） */
export function getWorkspace(user: MockUser): { clubId: string; clubName: string; role: MockRole['role']; permissions: string[]; memberId?: string } | null {
  if (!user.currentClubId) return null
  const role = user.roles.find((r) => r.clubId === user.currentClubId)
  if (!role) return null
  return { clubId: role.clubId, clubName: role.clubName || '计算机协会', role: role.role, permissions: role.permissions, memberId: USER_MEMBER_MAP[user.id] }
}
