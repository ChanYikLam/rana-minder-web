import { get, post, put } from '../client'
import type { ApiResult, PaginatedResult } from '@/types/contracts'
import type { SessionInfo, User } from '@/types/domain'

export const identityApi = {
  getSession: (mockUser?: string): Promise<ApiResult<SessionInfo>> =>
    get('/auth/session', mockUser ? { _mock_user: mockUser } : undefined),
  getProfile: (): Promise<ApiResult<User>> => get('/auth/profile'),
  updateProfile: (input: Partial<User>): Promise<ApiResult<User>> => put('/auth/profile', input),
  resolveSyncConflict: (input: { field: string; chosenValue: string }): Promise<ApiResult<User>> =>
    post('/auth/profile/sync-conflict', input),
}

export const exploreApi = {
  getClubs: (params?: { cursor?: string; search?: string }): Promise<ApiResult<PaginatedResult<{ id: string; name: string; description: string; memberCount: number; logo: string | null }>>> =>
    get('/explore/clubs', params),
  getActivities: (params?: { cursor?: string; search?: string; type?: string }): Promise<ApiResult<PaginatedResult<{ id: string; clubId: string; clubName: string; title: string; type: string; status: string; deadline: string; description: string }>>> =>
    get('/explore/activities', params),
}

export const organizationApi = {
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
