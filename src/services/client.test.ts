import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { get, getValidated, getPaginated, post, put, patch, del, __testing_pendingIdempotencyKeyCount, __testing_resetPendingIdempotencyKeys } from './client'
import { ERROR_MESSAGES, errorCodeOf } from './error-map'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubWindow(): void {
  vi.stubGlobal('window', { location: { origin: 'https://app.test' } })
}

describe('API client', () => {
  it('does not classify HTTP 202 as completed', async () => {
    stubWindow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'IFC-ERR-014',
      data: { taskId: 'task-1', status: 'processing' },
    }), { status: 202 })))

    const result = await post('/jobs', {})

    expect(result.kind).toBe('accepted')
  })

  it('rejects malformed data when a runtime schema is supplied', async () => {
    stubWindow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { count: 'not-a-number' },
    }), { status: 200 })))

    const result = await getValidated('/counter', z.object({ count: z.number() }))

    expect(result.kind).toBe('rejected')
  })

  it('rejects a successful response that omits the response envelope', async () => {
    stubWindow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ saved: true }), { status: 200 })))

    const result = await getValidated('/missing-envelope', z.object({ saved: z.boolean() }))

    expect(result.kind).toBe('rejected')
  })

  it('reuses the same idempotency key after an uncertain network failure', async () => {
    stubWindow()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network failure'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { saved: true } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await post('/records/stable-key', { value: 1 })
    await post('/records/stable-key', { value: 1 })

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(firstBody.idempotencyKey).toBeTruthy()
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey)
  })

  it('adds an idempotency key to bodyless mutation calls', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await post('/notifications/read-all')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.input).toEqual({})
    expect(body.idempotencyKey).toBeTruthy()
  })

  it('rethrows AbortError so cancellation propagates to the caller', async () => {
    stubWindow()
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      }),
    )

    const pending = get('/slow-endpoint', {}, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('maps non-AbortError network failure to rejected IFC-ERR-016', async () => {
    stubWindow()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    const result = await get('/unreachable')

    expect(result).toEqual({
      kind: 'rejected',
      error: { code: 'IFC-ERR-016', message: '网络连接异常，请检查网络后重试' },
    })
  })

  it('maps a hanging connection to dependency_unavailable (IFC-ERR-012) after timeout', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockImplementation((_url: unknown, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')))
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await get('/hang', undefined, undefined, 20)

    expect(result).toEqual({
      kind: 'dependency_unavailable',
      error: { code: 'IFC-ERR-012', message: ERROR_MESSAGES['IFC-ERR-012'] },
    })
    expect(errorCodeOf(result)).toBe('IFC-ERR-012')
    // 超时错误进入自动重试：默认最多 3 次尝试
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('auto-retries dependency_unavailable (503) and completes when a retry succeeds', async () => {
    stubWindow()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'IFC-ERR-012', message: '依赖服务不可用' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { ok: true } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await get('/flaky')

    expect(result).toEqual({ kind: 'completed', data: { ok: true } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not auto-retry non-retryable errors (IFC-ERR-005)', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'IFC-ERR-005', message: '校验失败' }), { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await get('/invalid')

    expect(result.kind).toBe('rejected')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops auto-retry when the caller aborts during backoff', async () => {
    stubWindow()
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'IFC-ERR-012', message: '依赖服务不可用' }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = get('/flaky', undefined, controller.signal)
    await new Promise((resolve) => setTimeout(resolve, 50))
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps a slow response-body read to dependency_unavailable (IFC-ERR-012) after timeout', async () => {
    stubWindow()
    // 响应头已到达，但响应体（json）读取慢于超时窗口
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => new Promise((resolve) => setTimeout(() => resolve({ code: 0, data: { ok: true } }), 120)),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await get('/slow-body', undefined, undefined, 20)

    expect(result).toEqual({
      kind: 'dependency_unavailable',
      error: { code: 'IFC-ERR-012', message: ERROR_MESSAGES['IFC-ERR-012'] },
    })
    // 响应体超时同样进入自动重试：默认最多 3 次尝试
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('treats 204 No Content as completed with undefined data', async () => {
    stubWindow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    const result = await del('/records/1')

    expect(result).toEqual({ kind: 'completed', data: undefined })
  })

  it('maps non-2xx (500) responses to rejected via the error map', async () => {
    stubWindow()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'IFC-ERR-016', message: '内部错误' }), { status: 500 })),
    )

    const result = await get('/broken')

    expect(result).toEqual({ kind: 'rejected', error: { code: 'IFC-ERR-016', message: '内部错误' } })
  })

  it('deletes the idempotency key after a successful submit so the next call gets a fresh key', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { saved: true } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await post('/records/rotate-key', { value: 1 })
    await post('/records/rotate-key', { value: 1 })

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(firstBody.idempotencyKey).toBeTruthy()
    expect(secondBody.idempotencyKey).not.toBe(firstBody.idempotencyKey)
  })

  it('204 also clears the pending idempotency key', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await del('/records/rotate-key')
    await del('/records/rotate-key')

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(firstBody.idempotencyKey).toBeTruthy()
    expect(secondBody.idempotencyKey).not.toBe(firstBody.idempotencyKey)
  })

  it('serializes query params, skips undefined/null, and GET carries no body', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await get('/search', { q: 'vue', page: 2, flag: true, skip: undefined, empty: null })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/search?q=vue&page=2&flag=true')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('getPaginated forwards cursor and limit as query params', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { items: [], nextCursor: null } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getPaginated('/items', { cursor: 'c1', limit: 10 })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/items?cursor=c1&limit=10')
  })

  it('sends FormData raw without ApiRequest envelope or Content-Type header', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { fileId: 'f1', status: 'clean' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const form = new FormData()
    form.append('file', new File(['x'], 'a.txt'))
    const result = await post('/files/upload', form)

    expect(result.kind).toBe('completed')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/files/upload')
    expect(init.body).toBe(form)
    expect(init.headers).toEqual({})
  })

  it('put/patch/del use the expected HTTP methods with ApiRequest envelope', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await put('/records/1', { name: 'x' })
    await patch('/records/1', { name: 'y' })
    await del('/records/1')

    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PATCH')
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('DELETE')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).input).toEqual({ name: 'x' })
    expect(JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string).input).toEqual({})
  })

  it('supports explicit idempotencyKey override', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await post('/records/explicit-key', { value: 1 }, { idempotencyKey: 'client-provided-key' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.idempotencyKey).toBe('client-provided-key')
  })
})

describe('幂等键生命周期清理（M-3）', () => {
  beforeEach(() => {
    __testing_resetPendingIdempotencyKeys()
  })
  afterEach(() => {
    __testing_resetPendingIdempotencyKeys()
    vi.useRealTimers()
  })

  /**
   * 失败请求（4xx/5xx/网络错误/超时）不删除 pendingIdempotencyKeys 条目，
   * 因此这些测试用 422 校验失败（IFC-ERR-005）作为“保留条目”的触发器。
   */

  it('TTL 内：同一 fingerprint 失败请求复用同一 key', async () => {
    stubWindow()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'IFC-ERR-005', message: '校验失败' }), { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)

    await post('/records/reuse-key', { value: 1 })
    await post('/records/reuse-key', { value: 1 })

    const firstKey = JSON.parse(fetchMock.mock.calls[0][1].body as string).idempotencyKey
    const secondKey = JSON.parse(fetchMock.mock.calls[1][1].body as string).idempotencyKey
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBe(firstKey)
  })

  it('TTL 过期后：重新生成 key', async () => {
    stubWindow()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'IFC-ERR-005', message: '校验失败' }), { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)

    await post('/records/expire-key', { value: 1 })
    const firstKey = JSON.parse(fetchMock.mock.calls[0][1].body as string).idempotencyKey

    // 推进时间越过 TTL（15 分钟 + 1 ms）
    vi.setSystemTime(new Date('2026-08-07T00:15:01Z'))
    await post('/records/expire-key', { value: 1 })
    const secondKey = JSON.parse(fetchMock.mock.calls[1][1].body as string).idempotencyKey

    expect(secondKey).not.toBe(firstKey)
  })

  it('过期条目会被清理：跨过清理节流后 Map 不再无限增长', async () => {
    stubWindow()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'IFC-ERR-005', message: '校验失败' }), { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)

    // 创建 5 个不同 fingerprint 的失败请求，条目均留在 Map
    for (let i = 0; i < 5; i += 1) {
      await post(`/records/cleanup-${i}`, { value: i })
    }
    expect(__testing_pendingIdempotencyKeyCount()).toBe(5)

    // 推进时间到 TTL 之后
    vi.setSystemTime(new Date('2026-08-07T00:15:01Z'))
    // 触发清理（通过新请求访问，会调用 getIdempotencyKey → cleanupExpiredIdempotencyKeys）
    await post('/records/cleanup-trigger', { value: 99 })

    // 过期条目已被清理，仅剩最新一条
    expect(__testing_pendingIdempotencyKeyCount()).toBe(1)
  })

  it('清理按节流：清理周期内重复访问不重复扫描', async () => {
    stubWindow()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'IFC-ERR-005', message: '校验失败' }), { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)

    // 创建 3 个不同 fingerprint 的失败请求
    for (let i = 0; i < 3; i += 1) {
      await post(`/records/throttle-${i}`, { value: i })
    }
    expect(__testing_pendingIdempotencyKeyCount()).toBe(3)

    // 推进 30 秒（仍在 1 分钟清理节流内）—— 此时新请求不触发清理
    vi.setSystemTime(new Date('2026-08-07T00:00:30Z'))
    await post('/records/throttle-x', { value: 0 })

    // 节流内不应删除任何条目，但新请求会添加一条
    expect(__testing_pendingIdempotencyKeyCount()).toBe(4)
  })
})
