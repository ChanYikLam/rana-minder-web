/** 传输中立请求/结果适配类型 */

export interface CursorPagination {
  nextCursor: string | null
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
}

export interface ApiRequest<T = Record<string, unknown>> {
  action?: string
  targetId?: string
  expectedVersion?: number
  idempotencyKey?: string
  input: T
}

export type ApiResult<T> =
  | { kind: 'completed'; data: T }
  | { kind: 'accepted'; data: { taskId: string; status: string } }
  | { kind: 'rejected'; error: ApiError }
  | { kind: 'concurrency_conflict'; error: ApiError; currentData: unknown }
  | { kind: 'external_uncertain'; error: ApiError }
  | { kind: 'dependency_unavailable'; error: ApiError }

export interface ApiError {
  code: string
  message: string
  supportId?: string
  fieldErrors?: Record<string, string[]>
}

export interface ApiResponse<T> {
  code: number
  data: T
}
