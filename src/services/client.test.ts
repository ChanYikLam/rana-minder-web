import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { getValidated, post } from './client'

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
})
