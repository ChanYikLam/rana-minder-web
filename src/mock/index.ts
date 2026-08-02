import type { MockMethod } from './types'
import { getActiveMockUser, resolveMockUser, getPermissions, getWorkspace, clearMockSession, USER_MEMBER_MAP, type MockUser } from './auth'
import { resolveMockError, mockErrorBody, MOCK_ERROR_HTTP } from './errors'
import * as db from './db'
import { recruitmentApiHandlers, withStatus, rdb, applicantIdOfUrl } from './recruitment-api'

/** 重认证 proof 有效期（一次性凭证，高风险操作校验后即消费） */
const REAUTH_TTL_MS = 10 * 60 * 1000
const reauthProofs = new Map<string, { userId: string; expiresAt: number }>()

function issueReauthProof(userId: string): { proof: string; expiresAt: string } {
  const proof = `reauth-${userId}-${Date.now()}`
  const expiresAt = Date.now() + REAUTH_TTL_MS
  reauthProofs.set(proof, { userId, expiresAt })
  return { proof, expiresAt: new Date(expiresAt).toISOString() }
}

function consumeReauthProof(proof: unknown): boolean {
  if (typeof proof !== 'string') return false
  const user = getActiveMockUser()
  const record = reauthProofs.get(proof)
  if (!user || !record || record.userId !== user.id || record.expiresAt <= Date.now()) return false
  reauthProofs.delete(proof)
  return true
}

/** 业务规则拒绝（HTTP 422 + IFC-ERR-008） */
function businessError(message: string) {
  return {
    statusCode: 422,
    body: { code: 'IFC-ERR-008', message, supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
  }
}

/** 无权限（HTTP 403 + IFC-ERR-003） */
function forbidden() {
  return {
    statusCode: 403,
    body: { code: 'IFC-ERR-003', message: '您没有执行此操作的权限', supportId: `MOCK-${Date.now().toString(36).toUpperCase()}` },
  }
}

/** mock 用户 id → 成员 id 映射（成员生命周期以成员视角模拟操作者） */
function actorMemberId(user: { id: string }): string | null {
  return USER_MEMBER_MAP[user.id] || null
}

/** mock 用户 id → 候选人 id 映射（被邀请人视角） */
const USER_CANDIDATE_MAP: Record<string, string> = {
  'user-candidate-001': 'cand-001',
}

function actorCandidateId(user: { id: string }): string | null {
  return USER_CANDIDATE_MAP[user.id] || null
}

/** 管理类操作权限边界（双保险之一：mock 层按权限拦截） */
function canManageMembers(user: MockUser, clubId: string): boolean {
  return getPermissions(user, clubId).includes('club:member:manage')
}

/** 部门负责人的数据范围：其当前任职部门名；其余角色返回 null（全社团） */
function departmentScopeFor(user: MockUser, clubId: string): string | null {
  if (user.roles.find((r) => r.clubId === clubId)?.role !== 'department_leader') return null
  const memberId = actorMemberId(user)
  const member = memberId ? db.findMember(clubId, memberId) : undefined
  return member?.positions.find((p) => p.status === 'active')?.departmentName ?? null
}

/** 仅社团负责人/人事管理员（不含部门负责人）可执行的成员管理操作 */
function canManageMembersFull(user: MockUser, clubId: string): boolean {
  if (!canManageMembers(user, clubId)) return false
  return user.roles.find((r) => r.clubId === clubId)?.role !== 'department_leader'
}

/** 导出任务（内存态；POST 创建后模拟异步完成） */
interface ExportTask { id: string; clubId: string; type: string; status: string; createdAt: string; completedAt: string | null; expiredAt: string | null; downloadUrl: string | null; fileSize: number }
const exportTasks: ExportTask[] = [
  { id: 'exp-001', clubId: 'club-001', type: '成员名单', status: 'completed', createdAt: '2025-07-28T10:00:00+08:00', completedAt: '2025-07-28T10:01:00+08:00', expiredAt: '2025-08-04T10:00:00+08:00', downloadUrl: '#', fileSize: 24576 },
  { id: 'exp-002', clubId: 'club-001', type: '招新统计', status: 'generating', createdAt: '2025-08-01T12:00:00+08:00', completedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0 },
]

/**
 * vite-plugin-mock 的 query 传递缺陷：
 * GET 带查询参数时 query 只含 URL 查询参数（路径参数丢失）；
 * POST 时 query 只含路径参数（URL 查询参数丢失）。
 * 这里在注册时统一把路径参数合并回 query，避免 handler 里依赖特定调用方式。
 */
function pathParamsFrom(url: string, pattern: string): Record<string, string> {
  try {
    const { pathname } = new URL(url, 'http://localhost')
    const pathSegs = pathname.split('/').filter(Boolean)
    const pattSegs = pattern.split('/').filter(Boolean)
    const out: Record<string, string> = {}
    pattSegs.forEach((s, i) => {
      if (s.startsWith(':')) out[s.slice(1)] = pathSegs[i] ?? ''
    })
    return out
  } catch {
    return {}
  }
}

function mergePathParams(handler: MockMethod): MockMethod {
  const original = handler.response
  const pattern = handler.url
  return {
    ...handler,
    response(request: { url: string; body: unknown; query: Record<string, string>; headers: Record<string, string> }) {
      const query = { ...pathParamsFrom(request.url, pattern), ...request.query }
      return (original as (r: typeof request) => unknown)({ ...request, query })
    },
  }
}

/** 会话处理器 */
const identityHandlers: MockMethod[] = [
  {
    url: '/api/auth/session',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: {
          user: {
            id: user.id,
            studentId: user.studentId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            avatar: user.avatar,
            emailVerified: user.emailVerified,
            profileComplete: user.profileComplete,
          },
          profileGate: {
            complete: user.profileComplete,
            emailVerified: user.emailVerified,
          },
          degraded: false,
          permissions: getPermissions(user, user.currentClubId || ''),
          workspace: getWorkspace(user),
        },
      }
    },
  },
  {
    url: '/api/auth/logout',
    method: 'delete',
    response: () => {
      return { code: 0, data: null }
    },
  },
  {
    url: '/api/me/clubs',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: {
          clubs: user.roles
            .filter((r) => r.clubId)
            .map((r) => ({
              clubId: r.clubId,
              clubName: r.clubName,
              role: r.role,
            })),
        },
      }
    },
  },
  {
    url: '/api/auth/profile',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: {
          studentId: user.studentId,
          name: user.name,
          email: user.email,
          phone: user.phone,
          emailVerified: user.emailVerified,
          profileComplete: user.profileComplete,
        },
      }
    },
  },
  {
    url: '/api/auth/profile',
    method: 'put',
    response: ({ url, body }: { url: string; body: { input: Record<string, unknown>; expectedVersion?: number } }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      // 模拟版本冲突
      if (body.expectedVersion !== undefined && body.expectedVersion < 1) {
        return {
          statusCode: 409,
          body: {
            code: 'IFC-ERR-005',
            message: '数据已被他人修改，请刷新后重试',
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
            currentData: { email: 'updated@example.edu.cn', phone: '13900000000' },
          },
        }
      }
      const user = resolveMockUser(url)
      const input = body.input || {}
      return {
        code: 0,
        data: {
          studentId: user.studentId,
          name: user.name,
          email: (input.email as string) || user.email,
          phone: (input.phone as string) || user.phone,
          emailVerified: user.emailVerified,
          profileComplete: true,
        },
      }
    },
  },
  {
    url: '/api/auth/profile/send-email-code',
    method: 'post',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      return { code: 0, data: { sent: true, expiresIn: 300 } }
    },
  },
  {
    url: '/api/auth/profile/verify-email',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { code: string } } }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      if (body.input?.code !== '123456') {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-007',
            message: '验证码不正确或已过期',
            fieldErrors: { code: ['验证码不正确或已过期'] },
          },
        }
      }
      return { code: 0, data: { emailVerified: true } }
    },
  },
  {
    url: '/api/auth/profile/sync-conflict',
    method: 'post',
    response: ({ url, body }: { url: string; body: { input: { field: string; chosenValue: string } } }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const field = body.input?.field
      if (!field || !['name', 'email', 'phone', 'studentId'].includes(field)) {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-008',
            message: '不支持的冲突字段',
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          },
        }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: {
          studentId: user.studentId,
          name: user.name,
          email: user.email,
          phone: user.phone,
          emailVerified: user.emailVerified,
          profileComplete: user.profileComplete,
        },
      }
    },
  },
  {
    url: '/api/auth/reauth',
    method: 'post',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      return {
        code: 0,
        data: issueReauthProof(user.id),
      }
    },
  },
  {
    url: '/api/auth/logout',
    method: 'post',
    response: () => {
      clearMockSession()
      return { code: 0, data: null }
    },
  },
  {
    url: '/api/auth/casdoor/login-url',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      // mock：直接返回一个"已登录"的回调地址
      const user = query.user || 'leader'
      return {
        code: 0,
        data: {
          loginUrl: `/?_mock_user=${user}&_mock_login=success`,
        },
      }
    },
  },
]

/** 公开目录处理器 */
const publicHandlers: MockMethod[] = [
  {
    url: '/api/explore/clubs',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      return {
        code: 0,
        data: {
          items: [
            { id: 'club-001', name: '计算机协会', description: '专注计算机技术交流与项目实践', memberCount: 128, logo: null },
            { id: 'club-002', name: '电子设计协会', description: '电子设计与嵌入式开发', memberCount: 86, logo: null },
            { id: 'club-003', name: '数学建模协会', description: '数学建模竞赛与学术研究', memberCount: 64, logo: null },
          ],
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/explore/activities',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      return {
        code: 0,
        data: {
          items: [
            {
              id: 'act-001',
              clubId: 'club-001',
              clubName: '计算机协会',
              title: '2025 秋季招新',
              type: 'recruitment',
              status: 'open',
              deadline: '2025-09-15T23:59:00+08:00',
              description: '面向全校新生的秋季招新活动',
            },
            {
              id: 'act-002',
              clubId: 'club-002',
              clubName: '电子设计协会',
              title: '嵌入式方向招新',
              type: 'recruitment',
              status: 'open',
              deadline: '2025-09-20T23:59:00+08:00',
              description: '嵌入式开发方向招新',
            },
          ],
          nextCursor: null,
        },
      }
    },
  },
]

/** 社团工作空间处理器 */
const organizationHandlers: MockMethod[] = [
  {
    url: '/api/org/:clubId/context',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const membership = user.roles.find((role) => role.clubId === query.clubId)
      if (!membership) {
        return { statusCode: 403, body: { code: 'IFC-ERR-004', message: '工作空间不可访问' } }
      }
      return {
        code: 0,
        data: {
          clubId: membership.clubId,
          clubName: membership.clubName,
          role: membership.role,
          permissions: membership.permissions,
        },
      }
    },
  },
  {
    url: '/api/org/:clubId/dashboard',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const permissions = getPermissions(user, query.clubId || '')
      const pendingApplications = db.departmentApplications.filter((a) => a.clubId === query.clubId && a.status === 'under_review').length
      const pendingInvitations = db.membershipInvitations.filter((i) => i.clubId === query.clubId && (i.status === 'sent' || i.status === 'pending_acceptance')).length
      return {
        code: 0,
        data: {
          club: { id: query.clubId, name: '计算机协会' },
          role: user.roles.find((r) => r.clubId === query.clubId)?.role || 'member',
          permissions,
          metrics: {
            pendingReviews: pendingApplications + pendingInvitations,
            pendingInterviews: 5,
            pendingResults: 0,
            syncErrors: 2,
          },
          todos: [
            { id: 'todo-001', type: 'application_review', title: '待审核报名申请', count: 12 },
            { id: 'todo-002', type: 'interview_schedule', title: '待安排面试', count: 5 },
            { id: 'todo-003', type: 'invitation_pending', title: '待发送邀请', count: 3 },
          ],
          recentActivities: [],
        },
      }
    },
  },
]

/** 通知处理器 */
const notificationHandlers: MockMethod[] = [
  {
    url: '/api/notifications',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const allItems = [
        { id: 'ntf-001', type: 'application', title: '报名申请已提交', body: '您的报名申请已提交，请等待审核。', read: false, createdAt: '2025-08-01T10:00:00+08:00', link: '/me/todo' },
        { id: 'ntf-002', type: 'interview', title: '面试已排期', body: '您的面试已安排，请查看日程。', read: false, createdAt: '2025-08-01T09:00:00+08:00', link: '/me/schedule' },
        { id: 'ntf-003', type: 'invitation', title: '收到录取邀请', body: '恭喜！您已收到录取邀请，请及时确认。', read: false, createdAt: '2025-07-31T14:00:00+08:00', link: '/me/invitations/recruitment/inv-001' },
        { id: 'ntf-004', type: 'system', title: '系统维护通知', body: '系统将于本周六凌晨进行维护。', read: true, createdAt: '2025-07-30T18:00:00+08:00', link: null },
      ]
      const items = query.unreadOnly === 'true' ? allItems.filter((n) => !n.read) : allItems
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  {
    url: '/api/notifications/unread-count',
    method: 'get',
    response: () => {
      return { code: 0, data: { count: 3 } }
    },
  },
  {
    url: '/api/notifications/:id/read',
    method: 'post',
    response: () => {
      return { code: 0, data: null }
    },
  },
  {
    url: '/api/notifications/read-all',
    method: 'post',
    response: () => {
      return { code: 0, data: null }
    },
  },
]

/** 个人中心处理器 */
const personalHandlers: MockMethod[] = [
  {
    url: '/api/me/todo',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const items: { id: string; type: string; title: string; description: string; deadline: string; link: string }[] = [
        { id: 'todo-1', type: 'invitation', title: '确认录取邀请', description: '计算机协会 - 2025秋季招新', deadline: '2025-08-05T23:59:00+08:00', link: '/me/invitations/recruitment/inv-001' },
        { id: 'todo-2', type: 'interview', title: '确认面试时间', description: '嵌入式方向面试', deadline: '2025-08-03T12:00:00+08:00', link: '/me/schedule' },
      ]
      // 被邀请人视角：常规入社邀请待处理
      const candidateId = actorCandidateId(user)
      if (candidateId) {
        const pending = db.membershipInvitations.find(
          (i) => i.candidateId === candidateId && (i.status === 'sent' || i.status === 'pending_acceptance')
        )
        if (pending) {
          items.unshift({
            id: 'todo-membership-' + pending.id,
            type: 'invitation',
            title: '处理常规入社邀请',
            description: '计算机协会' + (pending.departmentName ? ` · 加入「${pending.departmentName}」` : ''),
            deadline: pending.expiredAt,
            link: '/me/invitations/membership',
          })
        }
      }
      return {
        code: 0,
        data: { items, nextCursor: null },
      }
    },
  },
  {
    url: '/api/me/ongoing',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const applicantId = applicantIdOfUrl(url)
      const recItems = (applicantId ? rdb.recruitmentApplications.filter((a) => a.applicantId === applicantId) : [])
        .map((a) => {
          const act = rdb.findAnyActivity(a.activityId)
          return {
            id: a.id, type: 'application', title: `招新报名：${act?.title || a.activityId}`,
            description: `${act?.clubName || ''} · ${a.status === 'identity_anomaly' ? '身份异常待处理' : a.status === 'revision_requested' ? '补充材料待处理' : '报名审核中'}`,
            submittedAt: a.submittedAt, link: `/explore/activities/${a.activityId}`,
            activityId: a.activityId, status: a.status,
          }
        })
      const jointItems = (applicantId ? rdb.jointApplications.filter((a) => a.applicantId === applicantId) : [])
        .map((a) => {
          const ja = rdb.findJoint(a.jointId)
          return {
            id: a.id, type: 'joint', title: `联合报名：${ja?.title || a.jointId}`,
            description: '联合活动报名进行中',
            submittedAt: a.submittedAt, link: `/explore/activities/act-001`,
            activityId: '', status: a.status,
          }
        })
      const items = [...recItems, ...jointItems].filter((i) => ['submitted', 'revision_requested', 'identity_anomaly', 'accepted', 'pending_selection'].includes(i.status))
      return {
        code: 0,
        data: { items, nextCursor: null },
      }
    },
  },
  {
    url: '/api/me/history',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      return {
        code: 0,
        data: {
          items: [
            { id: 'his-1', type: 'application', title: '数学建模协会招新', result: '未录取', completedAt: '2024-09-20T15:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/me/schedule',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      return {
        code: 0,
        data: {
          items: [
            { id: 'sch-1', title: '技术部面试', activityTitle: '2025秋季招新', time: '2025-08-03T14:00:00+08:00', location: '教学楼A301', interviewerName: '王浩然', status: 'scheduled' },
          ],
          nextCursor: null,
        },
      }
    },
  },
]

/** 招新 + 联合活动处理器（有状态，数据源：src/mock/db-recruitment.ts） */

/** 成员生命周期处理器（有状态，数据源：src/mock/db.ts） */
const memberHandlers: MockMethod[] = [
  // 成员列表（静态路由必须排在动态 :memberId 之前）
  {
    url: '/api/org/:clubId/members',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const scope = departmentScopeFor(user, query.clubId)
      const all = db.listMembers(query.clubId)
      const list = scope
        ? all.filter((m) => m.positions.some((p) => p.status === 'active' && p.departmentName === scope))
        : all
      const search = query.search
      const filtered = search
        ? list.filter((m) => m.name.includes(search) || m.studentId === search)
        : list
      const activeMembers = list.filter((m) => m.status === 'active')
      const exitedMembers = list.filter((m) => m.status === 'exited' || m.status === 'removed')
      const deptSource = scope ? db.departments.filter((d) => d.name === scope) : db.departments
      const byDepartment = deptSource.map((d) => ({
        id: d.id,
        name: d.name,
        count: activeMembers.filter((m) => m.positions.some((p) => p.departmentId === d.id && p.status === 'active')).length,
      }))
      const zeroDeptCount = activeMembers.filter((m) => !m.positions.some((p) => p.status === 'active')).length
      const pendingCounts = {
        departmentApply: db.departmentApplications.filter((a) => a.clubId === query.clubId && a.status === 'under_review' && (!scope || a.targetDeptName === scope)).length,
        appointments: db.appointmentCommands.filter((c) => c.clubId === query.clubId && (c.status === 'pending_exec' || c.status === 'initiator_lost_rights' || c.status === 'reconfirmed') && (!scope || c.departmentName === scope)).length,
        transition: !scope && db.transitionState.candidates.length + db.transitionState.appointments.length > 0 && db.transitionState.executedAt === null ? 1 : 0,
      }
      return {
        code: 0,
        data: {
          items: filtered.map((m) => {
            const activePositions = m.positions.filter((p) => p.status === 'active')
            return {
              id: m.id, name: m.name, studentId: m.studentId,
              email: m.email, phone: m.phone,
              positions: activePositions.map((p) => ({
                departmentId: p.departmentId,
                departmentName: p.departmentName,
                title: p.title,
                status: p.status,
              })),
              department: activePositions.map((p) => p.departmentName).join(' + ') || '待分配',
              title: activePositions[0]?.title || '成员',
              status: m.status, joinedAt: m.joinedAt.slice(0, 10),
              exitedAt: m.exitedAt ? m.exitedAt.slice(0, 10) : null,
            }
          }),
          stats: {
            total: list.length,
            active: activeMembers.length,
            exited: exitedMembers.length,
            byDepartment,
            zeroDepartment: zeroDeptCount,
          },
          pendingCounts,
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/org/:clubId/members/department-apply',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const scope = departmentScopeFor(user, query.clubId)
      const list = db.departmentApplications.filter((a) => a.clubId === query.clubId && (!scope || a.targetDeptName === scope))
      return {
        code: 0,
        data: {
          items: list.map((a) => ({
            id: a.id, applicantId: a.applicantId, applicantName: a.applicantName,
            type: a.type, currentDept: a.currentDept,
            targetDeptId: a.targetDeptId, targetDeptName: a.targetDeptName,
            reason: a.reason, status: a.status, submittedAt: a.submittedAt,
            decidedAt: a.decidedAt, decidedBy: a.decidedBy, rejectReason: a.rejectReason,
          })),
          departments: db.departments,
          nextCursor: null,
        },
      }
    },
  },
  // 发起部门关系申请
  {
    url: '/api/org/:clubId/members/department-apply',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { type: string; targetDeptId: string; reason: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member) return forbidden()
      const active = member.positions.find((p) => p.status === 'active')
      const app = db.createDepartmentApplication(query.clubId, {
        applicantId: member.id, applicantName: member.name,
        type: (body.input?.type as 'join' | 'leave' | 'transfer') || 'join',
        currentDept: active?.departmentName || '-',
        targetDeptId: body.input?.targetDeptId,
        reason: body.input?.reason || '',
      })
      return { code: 0, data: { id: app.id, status: app.status, submittedAt: app.submittedAt } }
    },
  },
  // 撤回部门关系申请
  {
    url: '/api/org/:clubId/members/department-apply/:applicationId/withdraw',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const app = db.departmentApplications.find((a) => a.id === query.applicationId)
      if (!app) return { statusCode: 404, body: { code: 'IFC-ERR-004', message: '申请不存在', supportId: 'MOCK' } }
      if (app.status !== 'under_review') return { statusCode: 422, body: { code: 'IFC-ERR-008', message: '仅待审批的申请可撤回', supportId: 'MOCK' } }
      const actor = actorMemberId(user)
      const isApplicant = actor === app.applicantId
      if (!isApplicant && !canManageMembers(user, query.clubId)) return forbidden()
      app.status = 'withdrawn'
      return { code: 0, data: { id: app.id, status: app.status } }
    },
  },
  // 审批部门关系申请（批准/驳回）
  {
    url: '/api/org/:clubId/members/department-apply/:applicationId/decide',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { decision: string; rejectReason?: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      const scope = departmentScopeFor(user, query.clubId)
      if (!member || !canManageMembers(user, query.clubId)) return forbidden()
      const app = db.departmentApplications.find((a) => a.id === query.applicationId)
      if (!app) return { statusCode: 404, body: { code: 'IFC-ERR-004', message: '申请不存在', supportId: 'MOCK' } }
      if (scope && app.targetDeptName !== scope) return forbidden()
      const r = db.decideDepartmentApplication(query.applicationId, body.input?.decision === 'approve' ? 'approve' : 'reject', member.id, member.name, body.input?.rejectReason)
      if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: r.app?.id, status: r.app?.status } }
    },
  },
  // 执行部门关系申请（已批准→生效，含失败与重试）
  {
    url: '/api/org/:clubId/members/department-apply/:applicationId/execute',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembers(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      const app = db.departmentApplications.find((a) => a.id === query.applicationId)
      if (scope && app && app.targetDeptName !== scope) return forbidden()
      const r = db.executeDepartmentApplication(query.applicationId)
      if (!r.ok) {
        if (r.app) return { code: 0, data: { id: r.app.id, status: r.app.status, failed: true, message: r.error } }
        return businessError(r.error || '执行失败')
      }
      return { code: 0, data: { id: r.app?.id, status: r.app?.status, failed: false } }
    },
  },
  // 常规入社邀请列表（管理端）
  {
    url: '/api/org/:clubId/members/invite',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          items: db.membershipInvitations.filter((i) => i.clubId === query.clubId).map((i) => ({
            id: i.id, candidateId: i.candidateId, candidateName: i.candidateName, candidateStudentId: i.candidateStudentId,
            departmentId: i.departmentId, departmentName: i.departmentName,
            status: i.status, sentAt: i.sentAt, expiredAt: i.expiredAt, acceptedAt: i.acceptedAt, withdrawnAt: i.withdrawnAt,
          })),
          nextCursor: null,
        },
      }
    },
  },
  // 候选用户搜索（姓名连续子串/学号精确）
  {
    url: '/api/org/:clubId/members/invite/candidates',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const list = db.searchCandidates(query.clubId, query.search || '')
      return { code: 0, data: { items: list } }
    },
  },
  // 发送常规入社邀请
  {
    url: '/api/org/:clubId/members/invite',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { candidateId: string; departmentId: string | null; expireDays?: number } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member || !canManageMembersFull(user, query.clubId)) return forbidden()
      const r = db.createMembershipInvitation(query.clubId, {
        candidateId: body.input?.candidateId, departmentId: body.input?.departmentId || null,
        expireDays: body.input?.expireDays || 7, actorId: member.id, actorName: member.name,
      })
      if (!r.ok) return businessError(r.error || '发送失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status, sentAt: r.invitation?.sentAt } }
    },
  },
  // 撤回邀请
  {
    url: '/api/org/:clubId/members/invite/:invitationId/withdraw',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      const r = db.withdrawInvitation(query.invitationId)
      if (!r.ok) return businessError(r.error || '撤回失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status, withdrawnAt: r.invitation?.withdrawnAt } }
    },
  },
  // 被邀请人视角：我的常规入社邀请
  {
    url: '/api/me/invitations/membership',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      const candidateId = actorCandidateId(user)
      return {
        code: 0,
        data: {
          items: candidateId
            ? db.membershipInvitations.filter((i) => i.candidateId === candidateId).map((i) => ({
                id: i.id, clubId: i.clubId, clubName: '计算机协会', candidateName: i.candidateName,
                departmentId: i.departmentId, departmentName: i.departmentName,
                status: i.status, sentAt: i.sentAt, expiredAt: i.expiredAt, acceptedAt: i.acceptedAt,
              }))
            : [],
          nextCursor: null,
        },
      }
    },
  },
  // 被邀请人：接受/拒绝邀请（整体接受不可拆分）
  {
    url: '/api/me/invitations/membership/:invitationId/respond',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { action: string } } }) => {
      const user = resolveMockUser(url)
      const candidateId = actorCandidateId(user)
      const inv = db.membershipInvitations.find((i) => i.id === query.invitationId)
      if (!inv) return { statusCode: 404, body: { code: 'IFC-ERR-004', message: '邀请不存在', supportId: 'MOCK' } }
      if (candidateId && inv.candidateId !== candidateId) return forbidden()
      const r = db.respondInvitation(query.invitationId, body.input?.action === 'accept' ? 'accept' : 'reject')
      if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status, acceptedAt: r.invitation?.acceptedAt } }
    },
  },
  // 被邀请人：Casdoor 回读确认（接受后生效）
  {
    url: '/api/me/invitations/membership/:invitationId/sync-confirm',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      const r = db.confirmInvitationSync(query.invitationId)
      if (!r.ok) return businessError(r.error || '确认失败')
      return { code: 0, data: { id: r.invitation?.id, status: r.invitation?.status } }
    },
  },
  // 任命/调岗/免职：候选成员 + 预约命令列表
  {
    url: '/api/org/:clubId/members/appointments',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const scope = departmentScopeFor(user, query.clubId)
      const all = db.listMembers(query.clubId)
      const candidates = scope
        ? all.filter((m) => m.positions.some((p) => p.status === 'active' && p.departmentName === scope))
        : all
      return {
        code: 0,
        data: {
          items: candidates
            .filter((m) => m.status === 'active')
            .map((m) => {
              const active = m.positions.find((p) => p.status === 'active')
              return { id: m.id, name: m.name, studentId: m.studentId, department: active?.departmentName || '-', title: active?.title || '成员', status: m.status }
            }),
          departments: scope ? db.departments.filter((d) => d.name === scope) : db.departments,
          titles: scope ? ['干事'] : ['干事', '副部长', '部长', '副负责人'],
          commands: db.appointmentCommands.filter((c) => c.clubId === query.clubId && (!scope || c.departmentName === scope)).map((c) => ({
            id: c.id, action: c.action, memberId: c.memberId, memberName: c.memberName,
            departmentId: c.departmentId, departmentName: c.departmentName, title: c.title,
            scheduledAt: c.scheduledAt, status: c.status, createdAt: c.createdAt, createdBy: c.createdBy,
            executedAt: c.executedAt, failReason: c.failReason,
          })),
        },
      }
    },
  },
  // 发起任命/调岗/免职（立即或预约）
  {
    url: '/api/org/:clubId/members/appointments',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { action: string; memberId: string; departmentId: string | null; title: string | null; scheduledAt: string | null } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member || !canManageMembers(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      const target = db.findMember(query.clubId, body.input?.memberId)
      if (!target) return businessError('目标成员不存在')
      if (scope) {
        const inScope = target.positions.some((p) => p.status === 'active' && p.departmentName === scope)
        if (!inScope) return forbidden()
        if (body.input?.title && body.input.title !== '干事') return businessError('部门负责人仅可任命普通职位')
      }
      const r = db.createAppointmentCommand(query.clubId, {
        action: body.input?.action as 'appoint' | 'transfer' | 'dismiss',
        memberId: target.id, memberName: target.name,
        departmentId: body.input?.departmentId || null,
        departmentName: db.departments.find((d) => d.id === body.input?.departmentId)?.name || null,
        title: body.input?.title || null,
        scheduledAt: body.input?.scheduledAt || null,
        actorName: member.name,
      })
      if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: r.command?.id, status: r.command?.status } }
    },
  },
  // 取消预约命令
  {
    url: '/api/org/:clubId/members/appointments/:commandId/cancel',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembers(user, query.clubId)) return forbidden()
      const r = db.cancelAppointmentCommand(query.commandId)
      if (!r.ok) return businessError(r.error || '取消失败')
      return { code: 0, data: { id: query.commandId, status: 'cancelled' } }
    },
  },
  // 重新确认预约命令
  {
    url: '/api/org/:clubId/members/appointments/:commandId/reconfirm',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { scheduledAt?: string } } }) => {
      const user = resolveMockUser(url)
      if (!canManageMembers(user, query.clubId)) return forbidden()
      const r = db.reconfirmAppointmentCommand(query.commandId, body.input?.scheduledAt || new Date().toISOString())
      if (!r.ok) return businessError(r.error || '重新确认失败')
      return { code: 0, data: { id: query.commandId, status: 'reconfirmed' } }
    },
  },
  // 执行预约命令
  {
    url: '/api/org/:clubId/members/appointments/:commandId/execute',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembers(user, query.clubId)) return forbidden()
      const r = db.executeAppointmentCommand(query.commandId)
      if (!r.ok) {
        if (r.command) return { code: 0, data: { id: r.command.id, status: r.command.status, failed: true, message: r.error } }
        return businessError(r.error || '执行失败')
      }
      return { code: 0, data: { id: r.command?.id, status: r.command?.status, failed: false } }
    },
  },
  // 辞职申请列表（含审批）
  {
    url: '/api/org/:clubId/members/resignation',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          items: db.resignationRequests.filter((r) => r.clubId === query.clubId),
          nextCursor: null,
        },
      }
    },
  },
  // 提交辞职申请
  {
    url: '/api/org/:clubId/members/resignation',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { reason: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member) return forbidden()
      if (!body.input?.reason?.trim()) {
        return {
          statusCode: 422,
          body: {
            code: 'IFC-ERR-008',
            message: '辞职必须填写原因',
            fieldErrors: { reason: ['请填写辞职原因'] },
            supportId: `MOCK-${Date.now().toString(36).toUpperCase()}`,
          },
        }
      }
      const active = member.positions.find((p) => p.status === 'active')
      const req = db.createResignationRequest(query.clubId, member.id, member.name, active?.departmentName || '-', active?.title || '成员', body.input?.reason || '')
      return { code: 0, data: { id: req.id, status: req.status, submittedAt: req.submittedAt } }
    },
  },
  // 审批辞职申请
  {
    url: '/api/org/:clubId/members/resignation/:requestId/decide',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { decision: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user)
      const member = actor ? db.findMember(query.clubId, actor) : undefined
      if (!member || !canManageMembers(user, query.clubId)) return forbidden()
      const scope = departmentScopeFor(user, query.clubId)
      const req = db.resignationRequests.find((r) => r.id === query.requestId)
      if (scope && req && req.departmentName !== scope) return forbidden()
      const decision = body.input?.decision === 'approve' ? 'approve' : 'reject'
      const r = db.decideResignationRequest(query.requestId, decision, member.name)
      if (!r.ok) return businessError(r.error || '操作失败')
      return { code: 0, data: { id: query.requestId, status: decision === 'approve' ? 'approved' : 'rejected' } }
    },
  },
  // 成员退出列表（含辞职审批、主动退出）
  {
    url: '/api/org/:clubId/members/exit',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const scope = departmentScopeFor(user, query.clubId)
      const list = db.listMembers(query.clubId).filter((m) =>
        !scope || m.positions.some((p) => p.departmentName === scope),
      )
      return {
        code: 0,
        data: {
          items: list.map((m) => {
            const active = m.positions.find((p) => p.status === 'active')
            return {
              id: m.id, name: m.name, studentId: m.studentId,
              department: active?.departmentName || '-', title: active?.title || '成员',
              status: m.status, joinedAt: m.joinedAt.slice(0, 10),
              exitedAt: m.exitedAt ? m.exitedAt.slice(0, 10) : null,
            }
          }),
          resignations: db.resignationRequests.filter((r) => r.clubId === query.clubId && (!scope || r.departmentName === scope)),
          nextCursor: null,
        },
      }
    },
  },
  // 移除成员（管理员）
  {
    url: '/api/org/:clubId/members/exit',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { memberId: string } } }) => {
      const user = resolveMockUser(url)
      const actor = actorMemberId(user)
      if (!actor || !canManageMembers(user, query.clubId)) return forbidden()
      const memberId = body.input?.memberId
      if (memberId === actor) return businessError('不能移除自己')
      const member = db.findMember(query.clubId, memberId)
      if (!member) return businessError('成员不存在')
      const scope = departmentScopeFor(user, query.clubId)
      if (scope && !member.positions.some((p) => p.departmentName === scope)) return forbidden()
      if (db.isLastLeader(query.clubId, memberId)) return businessError('最后一名负责人不能无交接离任，请先安排交接')
      member.status = 'removed'
      member.exitedAt = new Date().toISOString()
      member.positions.forEach((p) => {
        if (p.status === 'active') { p.status = 'ended'; p.endDate = new Date().toISOString().slice(0, 10) }
      })
      return { code: 0, data: { memberId, status: member.status } }
    },
  },
  // 换届信息（可编辑方案 + 执行结果）
  {
    url: '/api/org/:clubId/members/transition',
    method: 'get',
    response: () => {
      const t = db.transitionState
      return {
        code: 0,
        data: {
          currentLeader: t.currentLeader,
          candidates: t.candidates,
          appointments: t.appointments,
          canExecute: t.candidates.length + t.appointments.length > 0 && t.executedAt === null,
          executedAt: t.executedAt,
          results: t.results,
          failOn: t.failOn,
        },
      }
    },
  },
  // 保存换届方案
  {
    url: '/api/org/:clubId/members/transition/plan',
    method: 'post',
    response: ({ query, url, body }: { query: Record<string, string>; url: string; body: { input: { candidates?: { memberId: string; name: string; currentTitle: string; proposedTitle: string; department: string }[]; appointments?: { memberId: string; name: string; currentTitle: string; proposedTitle: string; department: string }[] } } }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      if (body.input?.candidates) db.transitionState.candidates = body.input.candidates
      if (body.input?.appointments) db.transitionState.appointments = body.input.appointments
      return { code: 0, data: { saved: true } }
    },
  },
  // 执行换届
  {
    url: '/api/org/:clubId/members/transition',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      const t = db.transitionState
      if (t.executedAt) return businessError('换届已执行，请勿重复提交')
      if (t.candidates.length + t.appointments.length === 0) return businessError('无职位变化，无需执行换届')
      const results: { memberId: string; name: string; action: string; targetTitle: string; success: boolean; message: string }[] = []
      const partialFail = t.failOn === 'partial' && t.results.length === 0
      for (const c of t.candidates) {
        const success = !(partialFail && c.memberId === 'mem-002' && results.length >= 1)
        results.push({ memberId: c.memberId, name: c.name, action: 'promote', targetTitle: c.proposedTitle, success, message: success ? '已生效' : '新任写入失败，已撤回新增' })
      }
      for (const a of t.appointments) {
        const success = true
        results.push({ memberId: a.memberId, name: a.name, action: 'promote', targetTitle: a.proposedTitle, success, message: success ? '已生效' : '写入失败' })
      }
      t.results = results
      t.executedAt = new Date().toISOString()
      // 至少保留一名负责人：candidates 中的"负责人"全部成功后旧任保留
      const leaderCandidate = results.find((r) => r.targetTitle === '负责人')
      if (leaderCandidate && leaderCandidate.success) {
        const old = db.findMember(query.clubId, t.currentLeader.id)
        if (old) {
          const pos = old.positions.find((p) => p.status === 'active')
          if (pos) { pos.endDate = new Date().toISOString().slice(0, 10); pos.status = 'ended' }
          old.status = 'exited'
          old.exitedAt = new Date().toISOString()
          t.currentLeader = { id: leaderCandidate.memberId, name: leaderCandidate.name, title: leaderCandidate.targetTitle }
        }
      }
      return { code: 0, data: { executedAt: t.executedAt, results, finishedAt: null } }
    },
  },
  // 换届失败项重试
  {
    url: '/api/org/:clubId/members/transition/retry',
    method: 'post',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      if (!canManageMembersFull(user, query.clubId)) return forbidden()
      const t = db.transitionState
      if (!t.executedAt) return businessError('换届尚未执行')
      let changed = false
      t.results = t.results.map((r) => {
        if (!r.success) {
          changed = true
          return { ...r, success: true, message: '重试后已生效' }
        }
        return r
      })
      if (!changed) return businessError('没有失败项需要重试')
      return { code: 0, data: { results: t.results } }
    },
  },
  // 成员详情（动态 :memberId 必须放在所有静态子路由之后）
  {
    url: '/api/org/:clubId/members/:memberId',
    method: 'get',
    response: ({ query, url }: { query: Record<string, string>; url: string }) => {
      const user = resolveMockUser(url)
      const member = db.getMemberProfile(query.clubId, query.memberId)
      if (!member) return { statusCode: 404, body: { code: 'IFC-ERR-004', message: '成员不存在', supportId: 'MOCK' } }
      const scope = departmentScopeFor(user, query.clubId)
      if (scope && !member.positions.some((p) => p.departmentName === scope)) {
        return { statusCode: 404, body: { code: 'IFC-ERR-004', message: '成员不存在', supportId: 'MOCK' } }
      }
      return {
        code: 0,
        data: {
          id: member.id, clubId: member.clubId, studentId: member.studentId,
          name: member.name, email: member.email, phone: member.phone,
          status: member.status, joinedAt: member.joinedAt, exitedAt: member.exitedAt,
          positions: member.positions,
          tenures: member.tenures,
          departmentHistory: member.departmentHistory,
          anomalies: member.anomalies,
        },
      }
    },
  },
]

/** 支撑与平台处理器 */
const platformHandlers: MockMethod[] = [
  // 社团接入管理
  {
    url: '/api/admin/clubs',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'club-001', name: '计算机协会', status: 'approved', memberCount: 128, createdAt: '2022-09-01', groupMapped: true },
            { id: 'club-002', name: '电子设计协会', status: 'approved', memberCount: 86, createdAt: '2022-09-01', groupMapped: true },
            { id: 'club-004', name: '摄影协会', status: 'pending_review', memberCount: 0, createdAt: '2025-07-28', groupMapped: false },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 表单设计器
  {
    url: '/api/org/:clubId/forms/designer/:formId',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          id: 'form-001', title: '招新报名表', status: 'published',
          fields: [
            { id: 'f1', type: 'text', label: '自我介绍', required: true, readonly: false, permission: 'read_write', options: null, description: '简要介绍自己' },
            { id: 'f2', type: 'select', label: '意向部门', required: true, readonly: false, permission: 'read_write', options: ['技术部', '运营部', '设计部'], description: null },
            { id: 'f3', type: 'textarea', label: '相关经历', required: false, readonly: false, permission: 'read_write', options: null, description: '可选' },
            { id: 'f4', type: 'file', label: '作品附件', required: false, readonly: false, permission: 'read_write', options: null, description: '可选' },
          ],
          version: 1,
        },
      }
    },
  },
  // 邮件配置
  {
    url: '/api/org/:clubId/notifications/email-config',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          smtpHost: 'smtp.example.edu.cn', smtpPort: 465, smtpUser: 'club@example.edu.cn',
          fromName: '计算机协会', encryption: 'ssl', verified: true,
        },
      }
    },
  },
  // 保存邮件配置
  {
    url: '/api/org/:clubId/notifications/email-config',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, verified: true, savedAt: new Date().toISOString() } }
    },
  },
  // 测试邮件配置
  {
    url: '/api/org/:clubId/notifications/email-config/test',
    method: 'post',
    response: () => {
      return { code: 0, data: { status: 'sent', sentAt: new Date().toISOString(), to: 'config-owner@example.edu.cn' } }
    },
  },
  // 保存社团配置
  {
    url: '/api/org/:clubId/config',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, version: 2, savedAt: new Date().toISOString() } }
    },
  },
  // 批量操作执行
  {
    url: '/api/org/:clubId/batch/execute',
    method: 'post',
    response: ({ body }: { body: { input: { memberIds: string[]; action: string } } }) => {
      return {
        code: 0,
        data: {
          results: (body.input?.memberIds || []).map((id: string, i: number) => ({
            memberId: id, success: i % 3 !== 2, message: i % 3 === 2 ? '目标职位已存在' : '成功',
          })),
          completedAt: new Date().toISOString(),
        },
      }
    },
  },
  // 表单设计器保存草稿
  {
    url: '/api/org/:clubId/forms/designer/:formId/save',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: query.formId, status: 'draft', version: 2, savedAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 文件下载
  {
    url: '/api/files/:fileId/download',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          fileId: query.fileId, status: 'downloaded',
          downloadUrl: '/mock-files/' + query.fileId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      }
    },
  },
  // 事实纠错列表
  {
    url: '/api/org/:clubId/audit/corrections',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'cor-001', targetType: '申请记录', targetId: 'app-003', reason: '评分有误，应为 5 分', evidence: '截图', status: 'submitted', submittedAt: '2025-07-30T10:00:00+08:00', submitterName: '王浩然' },
            { id: 'cor-002', targetType: '成员信息', targetId: 'mem-002', reason: '部门信息未更新', evidence: '审批截图', status: 'approved', submittedAt: '2025-07-25T10:00:00+08:00', submitterName: '李思颖' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 发起事实纠错
  {
    url: '/api/org/:clubId/audit/corrections',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'cor-' + Date.now(), status: 'submitted', submittedAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 处理事实纠错（批准/拒绝）
  {
    url: '/api/org/:clubId/audit/corrections/:correctionId/decide',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: { decision: string } } }) => {
      return {
        code: 0,
        data: { id: query.correctionId, status: body.input?.decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date().toISOString() },
      }
    },
  },
  // 撤回事实纠错
  {
    url: '/api/org/:clubId/audit/corrections/:correctionId/withdraw',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return { code: 0, data: { id: query.correctionId, status: 'withdrawn', withdrawnAt: new Date().toISOString() } }
    },
  },
  // 审计日志
  {
    url: '/api/org/:clubId/audit/logs',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, query.clubId).includes('club:audit:view')) return forbidden()
      const allLogs = [
        { id: 'log-001', actorName: '张明远', action: '发布招新活动', targetType: '活动', targetId: 'act-001', detail: '2025 秋季招新', createdAt: '2025-08-01T10:30:00+08:00' },
        { id: 'log-002', actorName: '李思颖', action: '审批部门申请', targetType: '成员', targetId: 'mem-001', detail: '陈雨桐 技术->运营', createdAt: '2025-07-29T14:00:00+08:00' },
        { id: 'log-003', actorName: '王浩然', action: '提交评价', targetType: '申请', targetId: 'app-003', detail: '王梓涵 4分', createdAt: '2025-08-04T11:00:00+08:00' },
        { id: 'log-004', actorName: '张明远', action: '发送邀请', targetType: '邀请', targetId: 'inv-001', detail: '王梓涵 技术部', createdAt: '2025-08-04T12:00:00+08:00' },
      ]
      const search = query.search
      const items = search ? allLogs.filter((l) => l.actorName.includes(search) || l.action.includes(search) || l.detail.includes(search)) : allLogs
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 正式删除预览
  {
    url: '/api/admin/delete/preview',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          scope: query.scope || 'club',
          targets: [
            { id: 'club-004', label: '摄影协会', type: '社团', recordCount: 12, memberCount: 5 },
            { id: 'act-003', label: '2025 春季补录', type: '活动', recordCount: 3, memberCount: 0 },
          ],
          totalRecords: 15, totalMembers: 5, warning: '删除后不可恢复，相关数据将被永久清除',
          previewVersion: 4,
        },
      }
    },
  },
  // 数据保留策略
  {
    url: '/api/admin/retention',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          policies: [
            { id: 'rp-001', scope: '已退出成员数据', retentionDays: 365, action: 'auto_delete', status: 'active', updatedAt: '2025-07-01' },
            { id: 'rp-002', scope: '过期招新活动', retentionDays: 730, action: 'archive', status: 'active', updatedAt: '2025-07-01' },
            { id: 'rp-003', scope: '审计日志', retentionDays: 1095, action: 'keep', status: 'active', updatedAt: '2025-07-01' },
          ],
          draftVersion: null,
        },
      }
    },
  },
  // 新建保留策略草稿
  {
    url: '/api/admin/retention',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'rp-draft-' + Date.now(), status: 'draft', updatedAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 正式删除执行
  {
    url: '/api/admin/delete/execute',
    method: 'post',
    response: ({ body }: { body: { input: { targetIds: string[]; reason?: string; reauthProof?: string; previewVersion?: number } } }) => {
      if (!consumeReauthProof(body.input?.reauthProof)) {
        return { statusCode: 401, body: { code: 'IFC-ERR-002', message: '请重新验证身份' } }
      }
      if (body.input?.previewVersion !== 4) {
        return { statusCode: 409, body: { code: 'IFC-ERR-008', message: '删除影响预览已变化' } }
      }
      if (!body.input?.reason?.trim()) {
        return { statusCode: 422, body: { code: 'IFC-ERR-005', message: '必须填写删除原因' } }
      }
      if ((body.input?.targetIds || []).includes('club-004')) {
        return { statusCode: 422, body: { code: 'IFC-ERR-006', message: '目标仍存在活跃关系' } }
      }
      return {
        code: 0,
        data: {
          results: (body.input?.targetIds || []).map((id: string) => ({
            targetId: id, success: true, stores: ['数据库', '附件', '索引'],
          })),
          completedAt: new Date().toISOString(),
          auditRef: 'AUD-' + Date.now(),
        },
      }
    },
  },
  // 统计数据
  {
    url: '/api/org/:clubId/stats',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          summary: [
            { label: '总成员数', value: 128, trend: 'up', trendValue: 12 },
            { label: '本月新增', value: 8, trend: 'up', trendValue: 3 },
            { label: '活跃招新', value: 1, trend: 'flat', trendValue: 0 },
            { label: '待处理申请', value: 12, trend: 'down', trendValue: 5 },
          ],
          departmentDistribution: [
            { name: '技术部', count: 45 },
            { name: '运营部', count: 32 },
            { name: '设计部', count: 28 },
            { name: '人事部', count: 23 },
          ],
        },
      }
    },
  },
  // 导出任务列表
  {
    url: '/api/org/:clubId/exports',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const clubId = new URL(url, 'http://localhost').pathname.split('/')[3]
      return {
        code: 0,
        data: {
          items: exportTasks.filter((t) => t.clubId === clubId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          nextCursor: null,
        },
      }
    },
  },
  // 创建导出任务（EXP：导出是高危操作，需权限）
  {
    url: '/api/org/:clubId/exports',
    method: 'post',
    response: ({ url, query, body }: { url: string; query: Record<string, string>; body: { input: { type?: string; includeContact?: boolean; includeFiles?: boolean } } }) => {
      const user = resolveMockUser(url)
      const clubId = query.clubId
      if (!canManageMembers(user, clubId)) return forbidden()
      const type = body.input?.type || '成员名单'
      const task: ExportTask = {
        id: 'exp-' + Date.now(), clubId, type,
        status: 'generating', createdAt: new Date().toISOString(),
        completedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0,
      }
      exportTasks.push(task)
      setTimeout(() => {
        task.status = 'completed'
        task.completedAt = new Date().toISOString()
        task.expiredAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
        task.downloadUrl = `#exp-${task.id}`
        task.fileSize = 1024 * (16 + Math.floor(Math.random() * 48))
      }, 3000)
      return { code: 0, data: task }
    },
  },
  // 平台配置
  {
    url: '/api/org/:clubId/config',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          clubName: '计算机协会', clubDescription: '专注计算机技术交流',
          requireEmailVerification: true, requireProfileComplete: true,
          maxMembers: 200, allowSelfExit: true, academicYearStart: 9,
        },
      }
    },
  },
  // 权限模板
  {
    url: '/api/admin/config/permission-templates',
    method: 'get',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:config:manage')) return forbidden()
      return {
        code: 0,
        data: {
          items: [
            { id: 'tpl-001', name: '社团负责人模板', permissions: ['club:dashboard:view', 'club:recruitment:manage', 'club:member:manage', 'club:config:manage'], version: 2, status: 'published' },
            { id: 'tpl-002', name: '人事模板', permissions: ['club:dashboard:view', 'club:recruitment:manage', 'club:member:manage', 'club:batch:execute'], version: 1, status: 'published' },
            { id: 'tpl-003', name: '面试官模板', permissions: ['club:interview:view', 'club:interview:evaluate'], version: 1, status: 'draft' },
          ],
        },
      }
    },
  },
  // 发布权限模板
  {
    url: '/api/admin/config/permission-templates/:templateId/publish',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return { code: 0, data: { id: query.templateId, status: 'published', publishedAt: new Date().toISOString() } }
    },
  },
  // 批准社团接入
  {
    url: '/api/admin/clubs/:clubId/approve',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return { code: 0, data: { id: query.clubId, status: 'approved', approvedAt: new Date().toISOString() } }
    },
  },
  // 拒绝社团接入
  {
    url: '/api/admin/clubs/:clubId/reject',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return { code: 0, data: { id: query.clubId, status: 'rejected', rejectedAt: new Date().toISOString() } }
    },
  },
  // 运维状态
  {
    url: '/api/admin/ops-status',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          appVersion: 'v1.0.0-mock',
          uptime: '72h 15m',
          dependencies: [
            { name: 'PostgreSQL', status: 'healthy', latency: 3 },
            { name: 'Casdoor', status: 'healthy', latency: 12 },
            { name: '对象存储', status: 'healthy', latency: 8 },
            { name: '邮件服务', status: 'degraded', latency: 450 },
          ],
          taskQueue: { pending: 2, processing: 1, failed: 0 },
          lastCheckAt: new Date().toISOString(),
        },
      }
    },
  },
// 管理员路由：配置
  {
    url: '/api/admin/config',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          clubName: 'RanaMinder 平台', clubDescription: '社团招新管理平台',
          requireEmailVerification: true, requireProfileComplete: true,
          maxMembers: 500, allowSelfExit: true, academicYearStart: 9,
        },
      }
    },
  },
  {
    url: '/api/admin/config',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, version: 2, savedAt: new Date().toISOString() } }
    },
  },
  // 管理员路由：统计
  {
    url: '/api/admin/stats',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          summary: [
            { label: '总社团数', value: 3, trend: 'up', trendValue: 1 },
            { label: '总成员数', value: 278, trend: 'up', trendValue: 24 },
            { label: '活跃招新', value: 2, trend: 'flat', trendValue: 0 },
            { label: '待处理申请', value: 28, trend: 'down', trendValue: 8 },
          ],
          departmentDistribution: [
            { name: '计算机协会', count: 128 },
            { name: '电子设计协会', count: 86 },
            { name: '数学建模协会', count: 64 },
          ],
        },
      }
    },
  },
  // 管理员路由：导出
  {
    url: '/api/admin/exports',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'exp-003', clubId: 'club-001', type: '全平台成员名单', status: 'completed', createdAt: '2025-08-01T10:00:00+08:00', completedAt: '2025-08-01T10:05:00+08:00', expiredAt: '2025-08-08T10:00:00+08:00', downloadUrl: '#', fileSize: 32768 },
          ],
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/admin/exports',
    method: 'post',
    response: ({ url }: { url: string }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:delete:execute')) return forbidden()
      return {
        code: 0,
        data: {
          id: 'exp-' + Date.now(), clubId: '', type: '全平台导出',
          status: 'generating', createdAt: new Date().toISOString(),
          completedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0,
        },
      }
    },
  },
  {
    url: '/api/admin/exports/:id/download',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          fileId: query.id, status: 'downloaded',
          downloadUrl: '/mock-files/' + query.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      }
    },
  },
  // 管理员路由：审计日志
  {
    url: '/api/admin/audit/logs',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const user = resolveMockUser(url)
      if (!getPermissions(user, '').includes('platform:delete:execute')) return forbidden()
      const allLogs = [
        { id: 'log-101', actorName: '超级管理员', action: '强制关闭联合活动', targetType: '联合活动', targetId: 'jnt-002', detail: '设计+摄影联合招新', createdAt: '2025-08-01T09:00:00+08:00' },
        { id: 'log-102', actorName: '超级管理员', action: '批准社团接入', targetType: '社团', targetId: 'club-001', detail: '计算机协会', createdAt: '2025-07-01T10:00:00+08:00' },
      ]
      const search = query.search
      const items = search ? allLogs.filter((l) => l.actorName.includes(search) || l.action.includes(search) || l.detail.includes(search)) : allLogs
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 管理员路由：事实纠错
  {
    url: '/api/admin/audit/corrections',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'cor-003', targetType: '社团信息', targetId: 'club-002', reason: '社团名称有误', evidence: '审批文件', status: 'submitted', submittedAt: '2025-07-28T10:00:00+08:00', submitterName: '超级管理员' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/admin/audit/corrections',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'cor-' + Date.now(), status: 'submitted', submittedAt: new Date().toISOString(), ...body.input } }
    },
  },
  {
    url: '/api/admin/audit/corrections/:correctionId/decide',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: { decision: string } } }) => {
      return {
        code: 0,
        data: { id: query.correctionId, status: body.input?.decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date().toISOString() },
      }
    },
  },
  {
    url: '/api/admin/audit/corrections/:correctionId/withdraw',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return { code: 0, data: { id: query.correctionId, status: 'withdrawn', withdrawnAt: new Date().toISOString() } }
    },
  },
  // 管理员路由：邮件配置
  {
    url: '/api/admin/notifications/email-config',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          smtpHost: 'smtp.platform.edu.cn', smtpPort: 465, smtpUser: 'admin@platform.edu.cn',
          fromName: 'RanaMinder 平台', encryption: 'ssl', verified: true,
        },
      }
    },
  },
  {
    url: '/api/admin/notifications/email-config',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, verified: true, savedAt: new Date().toISOString() } }
    },
  },
  {
    url: '/api/admin/notifications/email-config/test',
    method: 'post',
    response: () => {
      return { code: 0, data: { status: 'sent', sentAt: new Date().toISOString(), to: 'admin@platform.edu.cn' } }
    },
  },
  {
    url: '/api/admin/notifications/email-config/rotate-key',
    method: 'post',
    response: () => {
      return { code: 0, data: { rotated: true, rotatedAt: new Date().toISOString() } }
    },
  },
  {
    url: '/api/admin/notifications/preferences',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, savedAt: new Date().toISOString() } }
    },
  },
  // 管理员路由：表单
  {
    url: '/api/admin/forms/designer/:formId',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          id: 'pform-001', title: '平台通用报名表', status: 'published',
          fields: [
            { id: 'f1', type: 'text', label: '姓名', required: true, readonly: false, permission: 'read_write', options: null, description: null },
            { id: 'f2', type: 'text', label: '学号', required: true, readonly: false, permission: 'read_write', options: null, description: null },
            { id: 'f3', type: 'select', label: '意向社团', required: true, readonly: false, permission: 'read_write', options: ['计算机协会', '电子设计协会', '数学建模协会'], description: null },
          ],
          version: 3,
        },
      }
    },
  },
  {
    url: '/api/admin/forms/designer/:formId/save',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: query.formId, status: 'draft', version: 2, savedAt: new Date().toISOString(), ...body.input } }
    },
  },
  {
    url: '/api/admin/forms/:formId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          id: query.formId, title: '平台通用表单', status: 'published',
          versions: [{
            version: 1, status: 'published', publishedAt: '2025-07-01T10:00:00+08:00',
            fields: [
              { id: 'f1', type: 'text', label: '字段1', description: null, required: true, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
            ],
          }],
        },
      }
    },
  },
  {
    url: '/api/admin/forms/versions/:formId/submit',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: query.formId, status: 'submitted', version: (body.input?.version as number) || 1, submittedAt: new Date().toISOString() } }
    },
  },
  // 工作空间：导出下载
  {
    url: '/api/org/:clubId/exports/:id/download',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          fileId: query.id, status: 'downloaded',
          downloadUrl: '/mock-files/' + query.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      }
    },
  },
  // 工作空间：邮件密钥轮换
  {
    url: '/api/org/:clubId/notifications/email-config/rotate-key',
    method: 'post',
    response: () => {
      return { code: 0, data: { rotated: true, rotatedAt: new Date().toISOString() } }
    },
  },
  // 工作空间：通知偏好
  {
    url: '/api/org/:clubId/notifications/preferences',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, savedAt: new Date().toISOString() } }
    },
  },
  // 工作空间：表单版本提交
  {
    url: '/api/org/:clubId/forms/versions/:formId/submit',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: query.formId, status: 'submitted', version: (body.input?.version as number) || 1, submittedAt: new Date().toISOString() } }
    },
  },
]

/** 列表页补充 handlers */
const listHandlers: MockMethod[] = [
  // 招新活动列表（社团工作空间）
  {
    url: '/api/org/:clubId/recruitment/list',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'act-001', title: '2025 秋季招新', status: 'published', channelStatus: 'open', deadline: '2025-09-15T23:59:00+08:00', applicantCount: 45, createdAt: '2025-08-01T10:00:00+08:00' },
            { id: 'act-003', title: '2025 春季补录', status: 'draft', channelStatus: 'closed', deadline: '2025-03-01T23:59:00+08:00', applicantCount: 0, createdAt: '2025-01-15T10:00:00+08:00' },
            { id: 'act-004', title: '2024 秋季招新', status: 'closed', channelStatus: 'closed_final', deadline: '2024-09-15T23:59:00+08:00', applicantCount: 62, createdAt: '2024-08-20T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 联合活动列表
  {
    url: '/api/org/:clubId/joint/list',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'jnt-001', title: '计算机+电子联合招新', status: 'published', channelStatus: 'open', participants: ['计算机协会', '电子设计协会'], applicantCount: 28, createdAt: '2025-08-01T10:00:00+08:00' },
            { id: 'jnt-002', title: '设计+摄影联合招新', status: 'closed', channelStatus: 'closed_final', participants: ['设计协会', '摄影协会'], applicantCount: 15, createdAt: '2024-09-01T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 表单列表
  {
    url: '/api/org/:clubId/forms',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'form-001', title: '招新报名表', status: 'published', version: 1, updatedAt: '2025-08-01T10:00:00+08:00' },
            { id: 'form-002', title: '面试评价表', status: 'published', version: 2, updatedAt: '2025-07-20T10:00:00+08:00' },
            { id: 'form-003', title: '成员信息表', status: 'draft', version: 1, updatedAt: '2025-07-25T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 平台表单列表
  {
    url: '/api/admin/forms',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'pform-001', title: '平台通用报名表', status: 'published', version: 3, scope: 'platform', updatedAt: '2025-07-01T10:00:00+08:00' },
            { id: 'pform-002', title: '平台通用面试表', status: 'published', version: 1, scope: 'platform', updatedAt: '2025-06-15T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 平台联合活动列表
  {
    url: '/api/admin/joint',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            {
              id: 'jnt-001', title: '计算机+电子联合招新', status: 'published', participants: ['计算机协会', '电子设计协会'], applicantCount: 28, canForceClose: true,
              clubs: [
                { clubId: 'club-001', clubName: '计算机协会', suspended: false },
                { clubId: 'club-002', clubName: '电子设计协会', suspended: false },
              ],
            },
            {
              id: 'jnt-002', title: '设计+摄影联合招新', status: 'closed', participants: ['设计协会', '摄影协会'], applicantCount: 15, canForceClose: false,
              clubs: [
                { clubId: 'club-004', clubName: '设计协会', suspended: true },
                { clubId: 'club-005', clubName: '摄影协会', suspended: false },
              ],
            },
          ],
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/admin/recruitment',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'act-001', title: '2025 秋季招新', clubName: '计算机协会', status: 'published', applicantCount: 28, canForceComplete: true },
            { id: 'act-002', title: '2025 设计部春招', clubName: '设计协会', status: 'closed', applicantCount: 12, canForceComplete: false },
            { id: 'act-003', title: '2025 新媒体招新', clubName: '新媒体协会', status: 'draft', applicantCount: 0, canForceComplete: false },
          ],
          nextCursor: null,
        },
      }
    },
  },
]

export default [
  ...identityHandlers,
  ...publicHandlers,
  ...organizationHandlers,
  ...notificationHandlers,
  ...personalHandlers,
  ...recruitmentApiHandlers,
  ...memberHandlers,
  ...platformHandlers,
  ...listHandlers,
].map(mergePathParams).map((h) => ('rawResponse' in h ? h : withStatus(h))) as MockMethod[]
