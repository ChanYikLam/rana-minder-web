import type { ApiRequest, ApiResult, PaginatedResult } from '@/types/contracts'
import { httpStatusToResult } from './error-map'

const BASE_URL = '/api'

const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000
const pendingIdempotencyKeys = new Map<string, { key: string; expiresAt: number }>()

function generateIdempotencyKey(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`
}

export interface RuntimeSchema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false }
}

interface RequestOptions<T = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  params?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  action?: string
  targetId?: string
  expectedVersion?: number
  idempotencyKey?: string
  signal?: AbortSignal
  schema?: RuntimeSchema<T>
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

function getIdempotencyKey(fingerprint: string): string {
  const now = Date.now()
  const existing = pendingIdempotencyKeys.get(fingerprint)
  if (existing && existing.expiresAt > now) return existing.key
  const key = generateIdempotencyKey()
  pendingIdempotencyKeys.set(fingerprint, { key, expiresAt: now + IDEMPOTENCY_TTL_MS })
  return key
}

function completedData<T>(body: unknown, schema?: RuntimeSchema<T>): ApiResult<T> {
  if (!body || typeof body !== 'object' || !Object.prototype.hasOwnProperty.call(body, 'data')) {
    return { kind: 'rejected', error: { code: 'IFC-ERR-016', message: '响应缺少必要数据' } }
  }
  const rawData = (body as { data: unknown }).data
  if (!schema) return { kind: 'completed', data: rawData as T }

  const parsed = schema.safeParse(rawData)
  return parsed.success
    ? { kind: 'completed', data: parsed.data }
    : { kind: 'rejected', error: { code: 'IFC-ERR-016', message: '响应数据格式不符合契约' } }
}

async function request<T>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
  const {
    method = 'GET',
    params,
    body,
    action,
    targetId,
    expectedVersion,
    idempotencyKey,
    signal,
    schema,
  } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  let requestBody: string | undefined
  let intentFingerprint: string | null = null

  if (method !== 'GET') {
    const input = body === undefined ? {} : body
    intentFingerprint = JSON.stringify({ method, path, action, targetId, expectedVersion, input })
    const apiRequest: ApiRequest = {
      action,
      targetId,
      expectedVersion,
      idempotencyKey: idempotencyKey || getIdempotencyKey(intentFingerprint),
      input: input as Record<string, unknown>,
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
      if (intentFingerprint) pendingIdempotencyKeys.delete(intentFingerprint)
      return { kind: 'completed', data: undefined as T }
    }

    const responseBody = await response.json().catch(() => ({}))

    if (response.status === 202) {
      return httpStatusToResult<T>(response.status, responseBody)
    }

    if (!response.ok) {
      return httpStatusToResult<T>(response.status, responseBody)
    }

    const result = completedData(responseBody, schema)
    if (result.kind === 'completed' && intentFingerprint) pendingIdempotencyKeys.delete(intentFingerprint)
    return result
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

export async function getValidated<T>(path: string, schema: RuntimeSchema<T>, params?: RequestOptions['params'], signal?: AbortSignal): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'GET', params, signal, schema })
}

export async function post<T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'POST', body })
}

export async function put<T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'PUT', body })
}

export async function patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'PATCH', body })
}

export async function del<T>(path: string, options?: Omit<RequestOptions<T>, 'method' | 'params' | 'body'>): Promise<ApiResult<T>> {
  return request<T>(path, { ...options, method: 'DELETE' })
}

export async function getPaginated<T>(path: string, params?: { cursor?: string; limit?: number } & Record<string, string | number | undefined>, signal?: AbortSignal): Promise<ApiResult<PaginatedResult<T>>> {
  return get<PaginatedResult<T>>(path, params as Record<string, string | number | undefined>, signal)
}
