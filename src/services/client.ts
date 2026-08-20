import type { ApiRequest, ApiResult, PaginatedResult } from '@/types/contracts'
import { errorCodeOf, ERROR_AUTO_RETRY, ERROR_MESSAGES, httpStatusToResult } from './error-map'

const BASE_URL = '/api'

const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000
/** 单次请求超时（毫秒）。连接挂起时触发，超时映射为可重试错误 IFC-ERR-012。 */
const DEFAULT_TIMEOUT_MS = 15_000
/** IFC-ERR-012 等可重试错误的最大自动重试次数（不含首次尝试）。 */
const AUTO_RETRY_MAX = 2
/** 自动重试递增退避的基准延迟（毫秒）。 */
const AUTO_RETRY_BASE_DELAY_MS = 250
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
  /** 单次请求超时（毫秒），缺省为 DEFAULT_TIMEOUT_MS（15s）。 */
  timeoutMs?: number
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

interface TimeoutSignalHandle {
  signal: AbortSignal
  timedOut: boolean
  cancel: () => void
}

/**
 * 将调用方 AbortSignal 与请求超时合并为一个信号。
 * - 调用方 abort：沿用其 reason（缺省 AbortError）原样传递；
 * - 超时触发：仅置 timedOut 并 abort，由调用方决定如何分类（不抛 AbortError，保留调用方取消语义）。
 */
function withTimeoutSignal(signal: AbortSignal | undefined, timeoutMs: number): TimeoutSignalHandle {
  const controller = new AbortController()
  let timedOut = false

  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) {
    controller.abort(signal.reason)
  } else {
    signal?.addEventListener('abort', onAbort, { once: true })
  }

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const cancel = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    cancel,
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('aborted', 'AbortError'))
    }
    if (signal?.aborted) {
      onAbort()
    } else {
      signal?.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function timeoutError<T>(): ApiResult<T> {
  return {
    kind: 'dependency_unavailable',
    error: { code: 'IFC-ERR-012', message: ERROR_MESSAGES['IFC-ERR-012'] },
  }
}

function networkError<T>(): ApiResult<T> {
  return {
    kind: 'rejected',
    error: { code: 'IFC-ERR-016', message: '网络连接异常，请检查网络后重试' },
  }
}

function abortedError(reason: unknown): DOMException {
  return reason instanceof DOMException ? reason : new DOMException('aborted', 'AbortError')
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
    timeoutMs,
    schema,
  } = options

  const headers: Record<string, string> = {}
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  let requestBody: BodyInit | undefined
  let intentFingerprint: string | null = null

  if (isFormData) {
    // 文件上传：直接发送 FormData，不包装 ApiRequest；boundary 由浏览器自动生成
    requestBody = body as unknown as BodyInit
  } else if (method !== 'GET') {
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

  for (let attempt = 0; ; attempt++) {
    const handle = withTimeoutSignal(signal, timeoutMs ?? DEFAULT_TIMEOUT_MS)
    let result: ApiResult<T>

    try {
      const response = await fetch(buildUrl(path, params), {
        method,
        headers,
        body: requestBody,
        credentials: 'include',
        signal: handle.signal,
      })

      if (response.status === 204) {
        if (intentFingerprint) pendingIdempotencyKeys.delete(intentFingerprint)
        result = { kind: 'completed', data: undefined as T }
      } else {
        const responseBody = await response.json().catch(() => ({}))

        if (response.status === 202) {
          result = httpStatusToResult<T>(response.status, responseBody)
        } else if (!response.ok) {
          result = httpStatusToResult<T>(response.status, responseBody)
        } else {
          result = completedData(responseBody, schema)
          if (result.kind === 'completed' && intentFingerprint) pendingIdempotencyKeys.delete(intentFingerprint)
        }
      }
    } catch {
      if (signal?.aborted) {
        // 调用方主动取消优先于超时，保留 AbortError 语义
        throw abortedError(signal.reason)
      }
      if (handle.timedOut) {
        // 连接挂起超时：映射为可重试的依赖不可用错误（IFC-ERR-012），进入自动重试
        result = timeoutError<T>()
      } else {
        result = networkError<T>()
      }
    } finally {
      handle.cancel()
    }

    if (signal?.aborted) throw abortedError(signal.reason)

    const code = errorCodeOf(result)
    if (attempt >= AUTO_RETRY_MAX || !ERROR_AUTO_RETRY[code]) return result

    await sleep(AUTO_RETRY_BASE_DELAY_MS * (attempt + 1), signal)
  }
}

export async function get<T>(path: string, params?: RequestOptions['params'], signal?: AbortSignal, timeoutMs?: number): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'GET', params, signal, timeoutMs })
}

export async function getValidated<T>(path: string, schema: RuntimeSchema<T>, params?: RequestOptions['params'], signal?: AbortSignal, timeoutMs?: number): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'GET', params, signal, schema, timeoutMs })
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

export async function getPaginated<T>(path: string, params?: { cursor?: string; limit?: number } & Record<string, string | number | undefined>, signal?: AbortSignal, timeoutMs?: number): Promise<ApiResult<PaginatedResult<T>>> {
  return get<PaginatedResult<T>>(path, params as Record<string, string | number | undefined>, signal, timeoutMs)
}
