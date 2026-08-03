import { z } from 'zod'
import { del, get, getValidated, post, put } from '../client'
import type { ApiResult, PaginatedResult } from '@/types/contracts'
import type { SessionInfo, User, WorkspaceContext } from '@/types/domain'

const userSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  avatar: z.string().nullable(),
  emailVerified: z.boolean(),
  profileComplete: z.boolean(),
})

const sessionSchema = z.object({
  user: userSchema,
  profileGate: z.object({
    complete: z.boolean(),
    emailVerified: z.boolean(),
  }),
  degraded: z.boolean(),
  degradedSince: z.string().nullable().optional(),
  permissions: z.array(z.string()),
  workspace: z.object({
    clubId: z.string(),
    clubName: z.string(),
    role: z.enum(['super_admin', 'club_leader', 'hr', 'department_leader', 'interviewer', 'member', 'applicant']),
    permissions: z.array(z.string()),
    memberId: z.string().optional(),
  }).nullable(),
})

const workspaceContextSchema = z.object({
  clubId: z.string().min(1),
  clubName: z.string().min(1),
  role: z.enum(['super_admin', 'club_leader', 'hr', 'department_leader', 'interviewer', 'member', 'applicant']),
  permissions: z.array(z.string()),
})

export const identityApi = {
  getSession: (mockUser?: string): Promise<ApiResult<SessionInfo>> =>
    getValidated('/auth/session', sessionSchema, mockUser ? { _mock_user: mockUser } : undefined),
  logout: (): Promise<ApiResult<void>> => del('/auth/logout'),
  getProfile: (): Promise<ApiResult<User>> => get('/auth/profile'),
  updateProfile: (input: Partial<User>): Promise<ApiResult<User>> => put('/auth/profile', input),
  resolveSyncConflict: (input: { field: string; chosenValue: string }): Promise<ApiResult<User>> =>
    post('/auth/profile/sync-conflict', input),
  reauthenticate: (): Promise<ApiResult<{ proof: string; expiresAt: string }>> =>
    post('/auth/reauth', {}),
  getMyClubs: (): Promise<ApiResult<{ clubs: { clubId: string; clubName: string; role: WorkspaceContext['role'] }[] }>> =>
    get('/me/clubs'),
}

export const exploreApi = {
  getClubs: (params?: { cursor?: string; search?: string }): Promise<ApiResult<PaginatedResult<{ id: string; name: string; description: string; memberCount: number; logo: string | null }>>> =>
    get('/explore/clubs', params),
  getActivities: (params?: { cursor?: string; search?: string; type?: string }): Promise<ApiResult<PaginatedResult<{ id: string; clubId: string; clubName: string; title: string; type: string; status: string; deadline: string; description: string }>>> =>
    get('/explore/activities', params),
}

export const organizationApi = {
  getContext: (clubId: string): Promise<ApiResult<WorkspaceContext>> =>
    getValidated(`/org/${clubId}/context`, workspaceContextSchema),
  getDashboard: (clubId: string): Promise<ApiResult<{ club: { id: string; name: string }; role: string; permissions: string[]; todos: { id: string; type: string; title: string; count: number }[]; recentActivities: unknown[] }>> =>
    get(`/org/${clubId}/dashboard`),
}

export const notificationApi = {
  list: (params?: { cursor?: string; unreadOnly?: boolean }): Promise<ApiResult<PaginatedResult<{ id: string; type: string; title: string; body: string; read: boolean; createdAt: string; link: string | null }>>> =>
    get('/notifications', params),
  markRead: (id: string): Promise<ApiResult<void>> => post(`/notifications/${id}/read`),
  markAllRead: (): Promise<ApiResult<void>> => post('/notifications/read-all'),
  getUnreadCount: (): Promise<ApiResult<{ count: number }>> => get('/notifications/unread-count'),
}
