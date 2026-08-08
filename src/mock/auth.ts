/**
 * Mock 层多角色用户数据
 * 模拟不同角色登录后的会话和权限
 */

import { resolveMemberId } from './db'

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
  /** 账号禁用：演示登录被拒绝（IDN 域），会话端点返回 403 */
  disabled?: boolean
}

export interface MockRole {
  clubId: string
  clubName: string
  role: 'super_admin' | 'club_leader' | 'hr' | 'department_leader' | 'interviewer' | 'member' | 'applicant'
  permissions: string[]
}

/** 预定义的 mock 用户（种子；运行期资料/验证变更在其克隆上生效，resetMockUsers 可还原） */
const seedMockUsers: Record<string, MockUser> = {
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
        clubName: '电子设计协会',
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
    name: '陈雨彤',
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
    name: '林婉婷',
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

  /** 资料不完整（IDN-011：可登录，但资料门未通过，业务写操作被拦截） */
  incomplete: {
    id: 'user-incomplete-001',
    studentId: '20240201',
    name: '赵雨萌',
    email: 'incomplete@example.edu.cn',
    phone: '13800000021',
    avatar: null,
    emailVerified: true,
    profileComplete: false,
    currentClubId: 'club-001',
    roles: [
      {
        clubId: 'club-001',
        clubName: '计算机协会',
        role: 'member',
        permissions: ['club:member:view-self'],
      },
    ],
  },

  /** 邮箱未验证（IDN-011：仅可浏览/补充资料/重发验证码/退出） */
  unverified: {
    id: 'user-unverified-001',
    studentId: '20240202',
    name: '孙雅静',
    email: 'unverified@example.edu.cn',
    phone: '13800000022',
    avatar: null,
    emailVerified: false,
    profileComplete: true,
    currentClubId: 'club-001',
    roles: [
      {
        clubId: 'club-001',
        clubName: '计算机协会',
        role: 'member',
        permissions: ['club:member:view-self'],
      },
    ],
  },

  /** 账号禁用（登录被拒绝，演示 IDN 域账号有效性） */
  disabled: {
    id: 'user-disabled-001',
    studentId: '20240203',
    name: '赵启明',
    email: 'disabled@example.edu.cn',
    phone: '13800000023',
    avatar: null,
    disabled: true,
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

/** 运行期可变用户表（种子深拷贝；资料/验证演示经此生效，resetMockUsers 可还原） */
export let mockUsers: Record<string, MockUser> = JSON.parse(JSON.stringify(seedMockUsers)) as Record<string, MockUser>

export function resetMockUsers(): void {
  mockUsers = JSON.parse(JSON.stringify(seedMockUsers)) as Record<string, MockUser>
}

/** SRS-FAIL-001 降级模式演示开关（Casdoor 故障时置位，会话端点据此输出 degraded / degradedSince） */
const mockDegraded = { enabled: false, since: 0 }

/** 开启降级演示：记录降级起点（15 分钟窗口的起算时刻） */
export function setMockDegraded(enabled = true): void {
  mockDegraded.enabled = enabled
  if (enabled) mockDegraded.since = Date.now()
}

export function resetMockDegraded(): void {
  mockDegraded.enabled = false
  mockDegraded.since = 0
}

/** 返回快照，避免调用方篡改内部状态 */
export function getMockDegraded(): { enabled: boolean; since: number } {
  return { ...mockDegraded }
}

/** 资料保存通过后置位（资料门联动：profileComplete → 会话 profileGate.complete） */
export function markProfileComplete(userId: string): void {
  for (const k of Object.keys(mockUsers)) {
    if (mockUsers[k].id === userId) mockUsers[k].profileComplete = true
  }
}

/** 邮箱验证码通过后置位（IDN-011 联动：emailVerified → 会话 profileGate.emailVerified） */
export function markEmailVerified(userId: string): void {
  for (const k of Object.keys(mockUsers)) {
    if (mockUsers[k].id === userId) mockUsers[k].emailVerified = true
  }
}

let activeMockUserKey: string | null = null

/** 演示登录身份目录（由 mockUsers 派生，MOCK 模式登录页按此渲染，避免与 mock 数据漂移） */
export interface DemoRoleInfo {
  key: string
  role: MockRole['role']
  label: string
  desc: string
  /** 演示角标（登录页区分资料不完整/邮箱未验证/账号禁用等特殊身份） */
  badge?: string
}

/** 特殊演示身份的角标（仅针对非默认态用户，普通角色不显示） */
const DEMO_BADGES: Partial<Record<string, string>> = {
  incomplete: '资料不完整',
  unverified: '邮箱未验证',
  disabled: '账号禁用',
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
    badge: DEMO_BADGES[key],
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

/** mock 用户 id → 候选人 id 映射（申请人视角操作者；通知/业务侧经此反查接收用户） */
export const USER_APPLICANT_MAP: Record<string, string> = {
  'user-applicant-001': 'u-001',
  'user-applicant-002': 'u-002',
  'user-applicant-003': 'u-006',
}

/** 获取当前用户的默认工作空间（有社团归属时返回） */
export function getWorkspace(user: MockUser): { clubId: string; clubName: string; role: MockRole['role']; permissions: string[]; memberId?: string } | null {
  if (!user.currentClubId) return null
  const role = user.roles.find((r) => r.clubId === user.currentClubId)
  if (!role) return null
  return { clubId: role.clubId, clubName: role.clubName || '计算机协会', role: role.role, permissions: role.permissions, memberId: resolveMemberId(user.id, role.clubId) ?? undefined }
}
