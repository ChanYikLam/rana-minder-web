import type { MockMethod } from 'vite-plugin-mock'
import { resolveMockUser, getPermissions } from './auth'
import { resolveMockError, mockErrorBody, MOCK_ERROR_HTTP } from './errors'

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
            avatar: user.avatar,
          },
          profileGate: {
            complete: user.profileComplete,
            emailVerified: user.emailVerified,
          },
          degraded: false,
          permissions: getPermissions(user, user.currentClubId || ''),
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
    url: '/api/org/:clubId/dashboard',
    method: 'get',
    response: ({ url, query }: { url: string; query: Record<string, string> }) => {
      const error = resolveMockError(url)
      if (error) {
        return { statusCode: MOCK_ERROR_HTTP[error], body: mockErrorBody(error) }
      }
      const user = resolveMockUser(url)
      const permissions = getPermissions(user, query.clubId || '')
      return {
        code: 0,
        data: {
          club: { id: query.clubId, name: '计算机协会' },
          role: user.roles.find((r) => r.clubId === query.clubId)?.role || 'member',
          permissions,
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
      return {
        code: 0,
        data: {
          items: [
            { id: 'todo-1', type: 'invitation', title: '确认录取邀请', description: '计算机协会 - 2025秋季招新', deadline: '2025-08-05T23:59:00+08:00', link: '/me/invitations/recruitment/inv-001' },
            { id: 'todo-2', type: 'interview', title: '确认面试时间', description: '嵌入式方向面试', deadline: '2025-08-03T12:00:00+08:00', link: '/me/schedule' },
          ],
          nextCursor: null,
        },
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
      return {
        code: 0,
        data: {
          items: [
            { id: 'og-1', type: 'application', title: '报名审核中', description: '计算机协会 - 技术部', submittedAt: '2025-08-01T10:00:00+08:00', link: '/me/history' },
          ],
          nextCursor: null,
        },
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

/** 招新活动处理器 */
const recruitmentHandlers: MockMethod[] = [
  // 活动详情（公开）
  {
    url: '/api/explore/activities/:id',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const activities: Record<string, unknown> = {
        'act-001': {
          id: 'act-001', clubId: 'club-001', clubName: '计算机协会',
          title: '2025 秋季招新', type: 'recruitment', status: 'published',
          channelStatus: 'open', deadline: '2025-09-15T23:59:00+08:00',
          description: '面向全校新生的秋季招新活动，技术部、运营部、设计部三大方向火热招募中！',
          departments: [
            { id: 'dept-001', name: '技术部' },
            { id: 'dept-002', name: '运营部' },
            { id: 'dept-003', name: '设计部' },
          ],
          formId: 'form-001',
        },
        'act-002': {
          id: 'act-002', clubId: 'club-002', clubName: '电子设计协会',
          title: '嵌入式方向招新', type: 'recruitment', status: 'published',
          channelStatus: 'open', deadline: '2025-09-20T23:59:00+08:00',
          description: '嵌入式开发方向招新，欢迎对硬件感兴趣的同学加入。',
          departments: [{ id: 'dept-004', name: '嵌入式组' }],
          formId: 'form-002',
        },
      }
      const data = activities[query.id || 'act-001'] || activities['act-001']
      return { code: 0, data }
    },
  },
  // 社团活动列表（管理视角）
  {
    url: '/api/org/:clubId/recruitment',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'act-001', clubId: query.clubId, title: '2025 秋季招新', status: 'published', channelStatus: 'open', deadline: '2025-09-15T23:59:00+08:00', applicantCount: 45, createdAt: '2025-08-01T10:00:00+08:00' },
            { id: 'act-003', clubId: query.clubId, title: '2025 春季补录', status: 'draft', channelStatus: 'closed', deadline: '2025-03-01T23:59:00+08:00', applicantCount: 0, createdAt: '2025-01-15T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 活动详情（管理视角）
  {
    url: '/api/org/:clubId/recruitment/:activityId',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          id: 'act-001', clubId: 'club-001', title: '2025 秋季招新',
          description: '面向全校新生的秋季招新活动',
          status: 'published', channelStatus: 'open',
          deadline: '2025-09-15T23:59:00+08:00',
          formId: 'form-001',
          departments: [
            { id: 'dept-001', name: '技术部' },
            { id: 'dept-002', name: '运营部' },
            { id: 'dept-003', name: '设计部' },
          ],
          applicantCount: 45, interviewCount: 12, invitationCount: 3,
          createdAt: '2025-08-01T10:00:00+08:00',
          updatedAt: '2025-08-01T12:00:00+08:00',
          version: 2,
        },
      }
    },
  },
  // 创建活动
  {
    url: '/api/org/:clubId/recruitment',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'act-new-' + Date.now(), ...body.input, status: 'draft', channelStatus: 'closed', version: 1 } }
    },
  },
  // 更新活动
  {
    url: '/api/org/:clubId/recruitment/:activityId',
    method: 'put',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { ...body.input, version: 2 } }
    },
  },
  // 报名申请列表
  {
    url: '/api/org/:clubId/recruitment/:activityId/applications',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const allApps = [
        { id: 'app-001', activityId: query.activityId, applicantId: 'u-001', applicantName: '刘子豪', applicantStudentId: '20240001', status: 'submitted', preferences: [{ order: 1, departmentId: 'dept-001', departmentName: '技术部' }, { order: 2, departmentId: 'dept-003', departmentName: '设计部' }], submittedAt: '2025-08-01T14:00:00+08:00', withdrawnAt: null, formVersion: 1 },
        { id: 'app-002', activityId: query.activityId, applicantId: 'u-002', applicantName: '陈雨桐', applicantStudentId: '20240002', status: 'under_review', preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }], submittedAt: '2025-08-01T15:00:00+08:00', withdrawnAt: null, formVersion: 1 },
        { id: 'app-003', activityId: query.activityId, applicantId: 'u-003', applicantName: '王梓涵', applicantStudentId: '20240003', status: 'accepted', preferences: [{ order: 1, departmentId: 'dept-001', departmentName: '技术部' }], submittedAt: '2025-07-31T10:00:00+08:00', withdrawnAt: null, formVersion: 1 },
        { id: 'app-004', activityId: query.activityId, applicantId: 'u-004', applicantName: '张博文', applicantStudentId: '20240004', status: 'rejected', preferences: [{ order: 1, departmentId: 'dept-002', departmentName: '运营部' }], submittedAt: '2025-07-31T11:00:00+08:00', withdrawnAt: null, formVersion: 1 },
        { id: 'app-005', activityId: query.activityId, applicantId: 'u-005', applicantName: '李欣怡', applicantStudentId: '20240005', status: 'draft', preferences: [], submittedAt: null, withdrawnAt: null, formVersion: 1 },
      ]
      const status = query.status
      const items = status && status !== 'all' ? allApps.filter((a) => a.status === status) : allApps
      return { code: 0, data: { items, nextCursor: null } }
    },
  },
  // 提交报名申请
  {
    url: '/api/activity/recruitment/:activityId/apply',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'app-new-' + Date.now(), status: 'submitted', submittedAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 保存报名草稿
  {
    url: '/api/activity/recruitment/:activityId/draft',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { activityId: query.activityId, status: 'draft', savedAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 面试列表
  {
    url: '/api/org/:clubId/recruitment/:activityId/interviews',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'iv-001', activityId: 'act-001', applicantId: 'u-001', applicantName: '刘子豪', status: 'scheduled', scheduledTime: '2025-08-05T14:00:00+08:00', location: '教学楼A301', interviewerIds: ['u-010'], interviewers: [{ id: 'u-010', name: '王浩然' }] },
            { id: 'iv-002', activityId: 'act-001', applicantId: 'u-002', applicantName: '陈雨桐', status: 'confirmed', scheduledTime: '2025-08-05T15:00:00+08:00', location: '教学楼A301', interviewerIds: ['u-010'], interviewers: [{ id: 'u-010', name: '王浩然' }] },
            { id: 'iv-003', activityId: 'act-001', applicantId: 'u-003', applicantName: '王梓涵', status: 'completed', scheduledTime: '2025-08-04T10:00:00+08:00', location: '教学楼A302', interviewerIds: ['u-011'], interviewers: [{ id: 'u-011', name: '李思颖' }] },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 面试详情
  {
    url: '/api/me/interviews/recruitment/:interviewId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          id: query.interviewId || 'iv-001', activityId: 'act-001', activityTitle: '2025 秋季招新',
          applicantName: '刘子豪', status: 'scheduled',
          scheduledTime: '2025-08-05T14:00:00+08:00', location: '教学楼A301',
          interviewers: [{ id: 'u-010', name: '王浩然' }],
          availableSlots: [
            { id: 'slot-1', time: '2025-08-05T14:00:00+08:00', location: '教学楼A301', capacity: 1, booked: 0 },
            { id: 'slot-2', time: '2025-08-05T15:00:00+08:00', location: '教学楼A301', capacity: 1, booked: 1 },
            { id: 'slot-3', time: '2025-08-05T16:00:00+08:00', location: '教学楼A302', capacity: 2, booked: 0 },
            { id: 'slot-4', time: '2025-08-06T10:00:00+08:00', location: '教学楼A301', capacity: 1, booked: 0 },
          ],
        },
      }
    },
  },
  // 评价列表
  {
    url: '/api/org/:clubId/recruitment/:activityId/reviews',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'rv-001', applicantId: 'u-003', applicantName: '王梓涵', departmentName: '技术部', status: 'concluded', rating: 4, comment: '技术基础扎实，沟通能力好', concludedAt: '2025-08-04T11:00:00+08:00', concludedBy: '李思颖' },
            { id: 'rv-002', applicantId: 'u-002', applicantName: '陈雨桐', departmentName: '运营部', status: 'evaluating', rating: null, comment: '', concludedAt: null, concludedBy: null },
            { id: 'rv-003', applicantId: 'u-001', applicantName: '刘子豪', departmentName: '技术部', status: 'pending', rating: null, comment: '', concludedAt: null, concludedBy: null },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 邀请列表
  {
    url: '/api/org/:clubId/recruitment/:activityId/invitations',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'inv-001', activityId: 'act-001', applicantId: 'u-003', applicantName: '王梓涵', status: 'accepted', sentAt: '2025-08-04T12:00:00+08:00', acceptedAt: '2025-08-04T18:00:00+08:00', expiredAt: '2025-08-07T12:00:00+08:00' },
            { id: 'inv-002', activityId: 'act-001', applicantId: 'u-006', applicantName: '周明轩', status: 'sent', sentAt: '2025-08-01T10:00:00+08:00', acceptedAt: null, expiredAt: '2025-08-04T10:00:00+08:00' },
            { id: 'inv-003', activityId: 'act-001', applicantId: 'u-007', applicantName: '孙佳琪', status: 'pending_acceptance', sentAt: '2025-08-01T10:00:00+08:00', acceptedAt: null, expiredAt: '2025-08-08T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 邀请详情（本人视角）
  {
    url: '/api/me/invitations/recruitment/:invitationId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          id: query.invitationId || 'inv-001', activityId: 'act-001',
          activityTitle: '2025 秋季招新', clubName: '计算机协会',
          applicantName: '刘子豪', status: 'pending_acceptance',
          sentAt: '2025-08-01T10:00:00+08:00',
          expiredAt: '2025-08-08T10:00:00+08:00',
          departmentName: '技术部',
        },
      }
    },
  },
  // 接受/拒绝邀请
  {
    url: '/api/me/invitations/recruitment/:invitationId/respond',
    method: 'post',
    response: ({ body }: { body: { input: { action: string } } }) => {
      const accepted = body.input?.action === 'accept'
      return {
        code: 0,
        data: { status: accepted ? 'accepted' : 'rejected', acceptedAt: accepted ? new Date().toISOString() : null },
      }
    },
  },
  // 动态表单定义
  {
    url: '/api/org/:clubId/forms/:formId',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          id: 'form-001', clubId: 'club-001', title: '招新报名表',
          status: 'published',
          versions: [{
            version: 1, status: 'published', publishedAt: '2025-08-01T10:00:00+08:00',
            fields: [
              { id: 'f1', type: 'text', label: '自我介绍', description: '简要介绍自己的特长和兴趣', required: true, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
              { id: 'f2', type: 'select', label: '意向部门', description: null, required: true, readonly: false, permission: 'read_write', options: ['技术部', '运营部', '设计部'], conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
              { id: 'f3', type: 'textarea', label: '相关经历', description: '如有相关项目或活动经历请填写', required: false, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
              { id: 'f4', type: 'file', label: '作品附件', description: '可选，上传作品集或简历', required: false, readonly: false, permission: 'read_write', options: null, conditionalFieldId: null, conditionalValue: null, arrayFieldTemplateId: null },
            ],
          }],
        },
      }
    },
  },
  // 文件预览
  {
    url: '/api/files/:fileId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          id: query.fileId || 'file-001', name: '作品集.pdf', size: 1048576,
          mimeType: 'application/pdf', status: 'approved',
          uploadedAt: '2025-08-01T14:00:00+08:00', checkedAt: '2025-08-01T14:01:00+08:00',
          downloadUrl: null,
        },
      }
    },
  },
]

/** 联合活动处理器 */
const jointHandlers: MockMethod[] = [
  {
    url: '/api/org/:clubId/joint',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'jnt-001', title: '计算机+电子联合招新', status: 'published', channelStatus: 'open', participantClubs: ['计算机协会', '电子设计协会'], applicantCount: 28, createdAt: '2025-08-01T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  {
    url: '/api/org/:clubId/joint/:jointId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          id: query.jointId || 'jnt-001', title: '计算机+电子联合招新',
          description: '计算机协会与电子设计协会联合举办的技术方向招新',
          status: 'published', channelStatus: 'open',
          deadline: '2025-09-20T23:59:00+08:00',
          participants: [
            { clubId: 'club-001', clubName: '计算机协会', status: 'accepted', concludedCount: 0 },
            { clubId: 'club-002', clubName: '电子设计协会', status: 'accepted', concludedCount: 0 },
          ],
          applicantCount: 28, version: 1,
        },
      }
    },
  },
  {
    url: '/api/org/:clubId/joint',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'jnt-new-' + Date.now(), ...body.input, status: 'draft', channelStatus: 'closed', version: 1 } }
    },
  },
  // 联合面试列表
  {
    url: '/api/org/:clubId/joint/:jointId/interviews',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'jiv-001', applicantName: '刘子豪', status: 'scheduled', scheduledTime: '2025-08-06T14:00:00+08:00', location: '教学楼B201', interviewers: [{ id: 'u-010', name: '王浩然' }, { id: 'u-020', name: '赵磊' }] },
            { id: 'jiv-002', applicantName: '陈雨桐', status: 'completed', scheduledTime: '2025-08-05T10:00:00+08:00', location: '教学楼B201', interviewers: [{ id: 'u-010', name: '王浩然' }] },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 联合结论列表
  {
    url: '/api/org/:clubId/joint/:jointId/conclusions',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'jcl-001', applicantName: '陈雨桐', clubName: '计算机协会', status: 'concluded', rating: 4, comment: '表现优秀', concludedAt: '2025-08-05T11:00:00+08:00' },
            { id: 'jcl-002', applicantName: '陈雨桐', clubName: '电子设计协会', status: 'pending', rating: null, comment: '', concludedAt: null },
            { id: 'jcl-003', applicantName: '刘子豪', clubName: '计算机协会', status: 'pending', rating: null, comment: '', concludedAt: null },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 联合活动结束信息
  {
    url: '/api/org/:clubId/joint/:jointId/close',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          id: 'jnt-001', title: '计算机+电子联合招新',
          status: 'published',
          participants: [
            { clubId: 'club-001', clubName: '计算机协会', status: 'accepted', concludedCount: 5, invitationSent: 3 },
            { clubId: 'club-002', clubName: '电子设计协会', status: 'accepted', concludedCount: 4, invitationSent: 2 },
          ],
          totalApplicants: 28, totalConcluded: 9, totalInvited: 5,
          canClose: true,
        },
      }
    },
  },
  // 提交联合活动报名
  {
    url: '/api/activity/joint/:jointId/apply',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'japp-' + Date.now(), status: 'submitted', submittedAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 联合结论评价提交
  {
    url: '/api/org/:clubId/joint/:jointId/conclusions/:conclusionId/evaluate',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: { rating?: number; comment?: string } } }) => {
      return {
        code: 0,
        data: { id: query.conclusionId, status: 'concluded', rating: body.input?.rating ?? null, comment: body.input?.comment ?? '', concludedAt: new Date().toISOString() },
      }
    },
  },
  // 发送联合录取邀请
  {
    url: '/api/org/:clubId/joint/:jointId/invitations',
    method: 'post',
    response: ({ query, body }: { query: Record<string, string>; body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'jinv-' + Date.now(), jointId: query.jointId, status: 'sent', sentAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 确认结束联合活动
  {
    url: '/api/org/:clubId/joint/:jointId/close',
    method: 'post',
    response: () => {
      return { code: 0, data: { status: 'closed', closedAt: new Date().toISOString(), channelStatus: 'closed_final' } }
    },
  },
]

/** 成员生命周期处理器 */
const memberHandlers: MockMethod[] = [
  // 成员列表（静态路由必须排在动态 :memberId 之前）
  {
    url: '/api/org/:clubId/members',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'mem-001', name: '陈雨桐', studentId: '20210005', department: '技术部', title: '干事', status: 'active', joinedAt: '2024-09-01' },
            { id: 'mem-002', name: '王浩然', studentId: '20210004', department: '技术部', title: '副部长', status: 'active', joinedAt: '2023-09-01' },
            { id: 'mem-003', name: '李思颖', studentId: '20210003', department: '人事部', title: '部长', status: 'active', joinedAt: '2023-09-01' },
            { id: 'mem-004', name: '张明远', studentId: '20210002', department: '管理', title: '负责人', status: 'active', joinedAt: '2022-09-01' },
            { id: 'mem-005', name: '刘子豪', studentId: '20240001', department: '-', title: '成员', status: 'exited', joinedAt: '2023-09-01' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 部门关系申请列表
  {
    url: '/api/org/:clubId/members/department-apply',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'dap-001', applicantName: '陈雨桐', currentDept: '技术部', targetDept: '运营部', reason: '希望尝试新的方向', status: 'under_review', submittedAt: '2025-07-28T10:00:00+08:00' },
            { id: 'dap-002', applicantName: '王梓涵', currentDept: '设计部', targetDept: '技术部', reason: '对前端开发更感兴趣', status: 'approved', submittedAt: '2025-07-20T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 常规入社邀请列表
  {
    url: '/api/org/:clubId/members/invite',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'minv-001', candidateName: '周明轩', candidateStudentId: '20240010', status: 'sent', sentAt: '2025-07-30T10:00:00+08:00', expiredAt: '2025-08-06T10:00:00+08:00' },
            { id: 'minv-002', candidateName: '孙佳琪', candidateStudentId: '20240011', status: 'accepted', sentAt: '2025-07-25T10:00:00+08:00', acceptedAt: '2025-07-26T15:00:00+08:00', expiredAt: '2025-08-01T10:00:00+08:00' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 任命/调岗/免职 候选成员
  {
    url: '/api/org/:clubId/members/appointments',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'mem-001', name: '陈雨桐', studentId: '20210005', department: '技术部', title: '干事', status: 'active' },
            { id: 'mem-002', name: '王浩然', studentId: '20210004', department: '技术部', title: '副部长', status: 'active' },
            { id: 'mem-003', name: '李思颖', studentId: '20210003', department: '人事部', title: '部长', status: 'active' },
          ],
          departments: [
            { id: 'dept-001', name: '技术部' },
            { id: 'dept-002', name: '运营部' },
            { id: 'dept-003', name: '设计部' },
            { id: 'dept-004', name: '人事部' },
          ],
          titles: ['干事', '副部长', '部长', '副部长（技术）'],
        },
      }
    },
  },
  // 成员退出列表
  {
    url: '/api/org/:clubId/members/exit',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'mem-001', name: '陈雨桐', studentId: '20210005', department: '技术部', title: '干事', status: 'active', joinedAt: '2024-09-01' },
            { id: 'mem-005', name: '刘子豪', studentId: '20240001', department: '-', title: '成员', status: 'exited', joinedAt: '2023-09-01', exitedAt: '2024-06-01' },
          ],
          nextCursor: null,
        },
      }
    },
  },
  // 换届信息
  {
    url: '/api/org/:clubId/members/transition',
    method: 'get',
    response: () => {
      return {
        code: 0,
        data: {
          currentLeader: { id: 'mem-004', name: '张明远', title: '负责人' },
          candidates: [
            { id: 'mem-002', name: '王浩然', currentTitle: '副部长', proposedTitle: '负责人', department: '技术部' },
            { id: 'mem-003', name: '李思颖', currentTitle: '部长', proposedTitle: '副负责人', department: '人事部' },
          ],
          appointments: [
            { id: 'mem-001', name: '陈雨桐', currentTitle: '干事', proposedTitle: '副部长', department: '技术部' },
          ],
          canExecute: true,
        },
      }
    },
  },
  // 成员详情（动态 :memberId 必须放在所有静态子路由之后）
  {
    url: '/api/org/:clubId/members/:memberId',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      return {
        code: 0,
        data: {
          id: query.memberId || 'mem-001', clubId: query.clubId, studentId: '20210005',
          name: '陈雨桐', email: 'member@example.edu.cn', phone: '13800000005',
          status: 'active', joinedAt: '2024-09-01T00:00:00+08:00', exitedAt: null,
          positions: [
            { id: 'pos-001', departmentId: 'dept-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, status: 'active' },
          ],
          tenures: [
            { id: 'ten-001', departmentName: '技术部', title: '干事', startDate: '2024-09-01', endDate: null, endReason: null },
          ],
        },
      }
    },
  },
  // 执行任命/调岗/免职
  {
    url: '/api/org/:clubId/members/appointments',
    method: 'post',
    response: ({ body }: { body: { input: { action: string; memberIds: string[] } } }) => {
      const action = body.input?.action || 'appoint'
      return {
        code: 0,
        data: {
          action, memberIds: body.input?.memberIds || [],
          executedAt: new Date().toISOString(),
          results: (body.input?.memberIds || []).map((id: string) => ({ memberId: id, success: true, message: '已执行' })),
        },
      }
    },
  },
  // 标记退出/移除成员
  {
    url: '/api/org/:clubId/members/exit',
    method: 'post',
    response: ({ body }: { body: { input: { memberIds: string[] } } }) => {
      return {
        code: 0,
        data: {
          memberIds: body.input?.memberIds || [],
          exitedAt: new Date().toISOString(),
          results: (body.input?.memberIds || []).map((id: string) => ({ memberId: id, success: true })),
        },
      }
    },
  },
  // 发送常规入社邀请
  {
    url: '/api/org/:clubId/members/invite',
    method: 'post',
    response: ({ body }: { body: { input: Record<string, unknown> } }) => {
      return { code: 0, data: { id: 'minv-' + Date.now(), status: 'sent', sentAt: new Date().toISOString(), ...body.input } }
    },
  },
  // 撤回邀请
  {
    url: '/api/org/:clubId/members/invite/:invitationId/withdraw',
    method: 'post',
    response: ({ query }: { query: Record<string, string> }) => {
      return { code: 0, data: { id: query.invitationId, status: 'withdrawn', withdrawnAt: new Date().toISOString() } }
    },
  },
  // 执行换届
  {
    url: '/api/org/:clubId/members/transition',
    method: 'post',
    response: () => {
      return {
        code: 0,
        data: {
          executedAt: new Date().toISOString(),
          results: [
            { memberId: 'mem-002', action: 'promote', targetTitle: '负责人', success: true },
            { memberId: 'mem-003', action: 'promote', targetTitle: '副负责人', success: true },
            { memberId: 'mem-001', action: 'promote', targetTitle: '副部长', success: true },
          ],
          finishedAt: null,
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
    response: ({ query }: { query: Record<string, string> }) => {
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
    response: ({ body }: { body: { input: { targetIds: string[] } } }) => {
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
    response: () => {
      return {
        code: 0,
        data: {
          items: [
            { id: 'exp-001', type: '成员名单', status: 'completed', createdAt: '2025-07-28T10:00:00+08:00', completedAt: '2025-07-28T10:01:00+08:00', expiredAt: '2025-08-04T10:00:00+08:00', downloadUrl: '#', fileSize: 24576 },
            { id: 'exp-002', type: '招新统计', status: 'generating', createdAt: '2025-08-01T12:00:00+08:00', completedAt: null, expiredAt: null, downloadUrl: null, fileSize: 0 },
          ],
          nextCursor: null,
        },
      }
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
    response: () => {
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
            { id: 'jnt-001', title: '计算机+电子联合招新', status: 'published', participants: ['计算机协会', '电子设计协会'], applicantCount: 28, canForceClose: true },
            { id: 'jnt-002', title: '设计+摄影联合招新', status: 'closed', participants: ['设计协会', '摄影协会'], applicantCount: 15, canForceClose: false },
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
  ...recruitmentHandlers,
  ...jointHandlers,
  ...memberHandlers,
  ...platformHandlers,
  ...listHandlers,
] as MockMethod[]
