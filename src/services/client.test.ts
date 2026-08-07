import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { get, getValidated, getPaginated, post, put, patch, del } from './client'

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
