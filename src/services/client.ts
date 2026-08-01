import type { ApiRequest, ApiResult, PaginatedResult } from '@/types/contracts'
import { httpStatusToResult } from './error-map'

const BASE_URL = '/api'

let idempotencyCounter = 0

function generateIdempotencyKey(): string {
  idempotencyCounter += 1
  return `idem-${Date.now()}-${idempotencyCounter}`
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  params?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  action?: string
  targetId?: string
  expectedVersion?: number
  idempotencyKey?: string
  signal?: AbortSignal
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.pathname + url.search
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const {
    method = 'GET',
    params,
    body,
    action,
    targetId,
    expectedVersion,
    idempotencyKey,
    signal,
  } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  let requestBody: string | undefined

  if (body !== undefined && method !== 'GET') {
    const apiRequest: ApiRequest = {
      action,
      targetId,
      expectedVersion,
      idempotencyKey: idempotencyKey || generateIdempotencyKey(),
      input: body as Record<string, unknown>,
    }
    requestBody = JSON.stringify(apiRequest)
  }

  try {
    const response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: requestBody,
      credentials: 'include',
      signal,
    })

    if (response.status === 204) {
      return { kind: 'completed', data: undefined as T }
    }

    const responseBody = await response.json().catch(() => ({}))

    if (!response.ok) {
      return httpStatusToResult<T>(response.status, responseBody)
    }

    const data = (responseBody as { data: T }).data ?? (responseBody as T)
    return { kind: 'completed', data }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    return {
      kind: 'rejected',
      error: {
        code: 'IFC-ERR-016',
        message: '网络连接异常，请检查网络后重试',
      },
    }
  }
}

export async function get<T>(path: string, params?: RequestOptions['params'], signal?: AbortSignal): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'GET', params, signal })
}

export async function post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'POST', body })
}

export async function put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'PUT', body })
}

export async function patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'PATCH', body })
}

export async function del<T>(path: string, options?: Omit<RequestOptions, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'DELETE' })
}

export async function getPaginated<T>(path: string, params?: { cursor?: string; limit?: number } & Record<string, string | number | undefined>, signal?: AbortSignal): Promise<ApiResult<PaginatedResult<T>>> {
  return get<PaginatedResult<T>>(path, params as Record<string, string | number | undefined>, signal)
}
