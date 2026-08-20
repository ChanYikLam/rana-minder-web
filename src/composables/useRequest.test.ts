import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRequest } from './useRequest'
import type { ApiResult } from '@/types/contracts'

describe('useRequest 页面状态机', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('completed 非分页数据：state=normal 并写入 data', async () => {
    const { execute, data, state } = useRequest<{ id: string }>(async () => ({ kind: 'completed', data: { id: 'a1' } }))

    await execute()

    expect(state.value).toBe('normal')
    expect(data.value).toEqual({ id: 'a1' })
  })

  it('completed 空 items：state=empty', async () => {
    const { execute, state } = useRequest<{ items: unknown[] }>(async () => ({ kind: 'completed', data: { items: [] } }))

    await execute()

    expect(state.value).toBe('empty')
  })

  it('completed 非空 items：state=normal', async () => {
    const { execute, state } = useRequest<{ items: unknown[] }>(async () => ({ kind: 'completed', data: { items: [1] } }))

    await execute()

    expect(state.value).toBe('normal')
  })

  it('accepted 且未配置 poll：state=error 而非永久 loading', async () => {
    const { execute, state, error } = useRequest(async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value?.code).toBe('IFC-ERR-014')
  })

  it('external_uncertain 且未配置 poll：state=error 并携带服务端消息', async () => {
    const { execute, state, error } = useRequest(async () => ({ kind: 'external_uncertain', error: { code: 'IFC-ERR-013', message: 'x' } }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value).toEqual({ code: 'IFC-ERR-013', message: 'x' })
  })

  it('accepted 配置 poll：轮询至 completed 后写入 data 并停止轮询', async () => {
    vi.useFakeTimers()
    let calls = 0
    const poll = vi.fn(async (): Promise<ApiResult<{ id: string }>> => {
      calls += 1
      return calls >= 2 ? { kind: 'completed', data: { id: 'done' } } : { kind: 'accepted', data: { taskId: 't1', status: 'processing' } }
    })
    const { execute, data, state, stopPolling } = useRequest<{ id: string }>(async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }), {
      poll,
      pollIntervalMs: 1000,
    })

    await execute()
    expect(state.value).toBe('loading')

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)
    expect(state.value).toBe('loading')

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(2)
    expect(state.value).toBe('normal')
    expect(data.value).toEqual({ id: 'done' })

    await vi.advanceTimersByTimeAsync(5000)
    expect(poll).toHaveBeenCalledTimes(2)
    stopPolling()
  })

  it('accepted 配置 poll：超过最大轮询次数后终止为 error', async () => {
    vi.useFakeTimers()
    const poll = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }))
    const { execute, state, error, stopPolling } = useRequest<{ id: string }>(async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }), {
      poll,
      pollIntervalMs: 1000,
      maxPollAttempts: 2,
    })

    await execute()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(poll).toHaveBeenCalledTimes(2)
    expect(state.value).toBe('error')
    expect(error.value?.code).toBe('IFC-ERR-014')

    await vi.advanceTimersByTimeAsync(5000)
    expect(poll).toHaveBeenCalledTimes(2)
    stopPolling()
  })

  it('accepted 配置 poll：轮询返回错误类结果则终止轮询并呈现错误', async () => {
    vi.useFakeTimers()
    const poll = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'rejected', error: { code: 'IFC-ERR-012', message: '服务不可用' } }))
    const { execute, state, error, stopPolling } = useRequest<{ id: string }>(async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }), {
      poll,
      pollIntervalMs: 1000,
    })

    await execute()
    await vi.advanceTimersByTimeAsync(1000)

    expect(state.value).toBe('error')
    expect(error.value?.message).toBe('服务不可用')

    await vi.advanceTimersByTimeAsync(5000)
    expect(poll).toHaveBeenCalledTimes(1)
    stopPolling()
  })

  it('stopPolling 立即停止轮询且不再触发', async () => {
    vi.useFakeTimers()
    const poll = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }))
    const { execute, stopPolling } = useRequest<{ id: string }>(async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }), {
      poll,
      pollIntervalMs: 1000,
    })

    await execute()
    stopPolling()
    await vi.advanceTimersByTimeAsync(5000)

    expect(poll).not.toHaveBeenCalled()
  })

  it('concurrency_conflict：state=error 并携带 supportId', async () => {
    const { execute, state, error } = useRequest(async () => ({
      kind: 'concurrency_conflict',
      error: { code: 'IFC-ERR-008', message: '数据已变化', supportId: 'SUP-9' },
      currentData: {},
    }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value).toEqual({ code: 'IFC-ERR-008', message: '数据已变化', supportId: 'SUP-9' })
  })

  it('dependency_unavailable：state=error', async () => {
    const { execute, state, error } = useRequest(async () => ({
      kind: 'dependency_unavailable',
      error: { code: 'IFC-ERR-012', message: '服务不可用' },
    }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value?.message).toBe('服务不可用')
  })

  it('rejected 越权码（003）：state=forbidden', async () => {
    const { execute, state } = useRequest(async () => ({
      kind: 'rejected',
      error: { code: 'IFC-ERR-003', message: '无权限' },
    }))

    await execute()

    expect(state.value).toBe('forbidden')
  })

  it('rejected 一般码（005）：state=error', async () => {
    const { execute, state, error } = useRequest(async () => ({
      kind: 'rejected',
      error: { code: 'IFC-ERR-005', message: '校验失败' },
    }))

    await execute()

    expect(state.value).toBe('error')
    expect(error.value?.message).toBe('校验失败')
  })

  it('fn 抛异常：state=error 且错误信息取自异常', async () => {
    const { execute, state, error } = useRequest(async () => {
      throw new Error('boom')
    })

    await execute()

    expect(state.value).toBe('error')
    expect(error.value).toEqual({ code: 'IFC-ERR-016', message: 'boom' })
  })

  it('执行期间并发调用不丢弃：合并为一次补跑并全部 resolve', async () => {
    let resolveFn: (r: ApiResult<{ id: string }>) => void = () => {}
    let first = true
    const fn = vi.fn(() => {
      if (first) {
        first = false
        return new Promise<ApiResult<{ id: string }>>((resolve) => { resolveFn = resolve })
      }
      return Promise.resolve({ kind: 'completed', data: { id: 'x' } } as const)
    })
    const { execute, state } = useRequest<{ id: string }>(fn)

    const p1 = execute()
    const p2 = execute()
    const p3 = execute()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(state.value).toBe('loading')

    resolveFn({ kind: 'completed', data: { id: 'x' } })
    await Promise.all([p1, p2, p3])

    // 初始 1 次 + 并发期间合并的补跑 1 次，无调用被静默丢弃
    expect(fn).toHaveBeenCalledTimes(2)
    expect(state.value).toBe('normal')
  })

  it('immediate: 初始 state=loading 并自动执行一次', async () => {
    const fn = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'completed', data: { id: 'x' } }))
    const { state } = useRequest<{ id: string }>(fn, { immediate: true })

    expect(state.value).toBe('loading')
    await new Promise((r) => setTimeout(r, 0))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(state.value).toBe('normal')
  })

  it('refresh 重新执行', async () => {
    const fn = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'completed', data: { id: 'x' } }))
    const { refresh } = useRequest<{ id: string }>(fn)

    await refresh()
    await refresh()

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('refresh 可中断进行中的轮询并重新加载', async () => {
    vi.useFakeTimers()
    const poll = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }))
    const load = vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ kind: 'completed', data: { id: 'x' } }))
    const { execute, refresh, state, stopPolling } = useRequest<{ id: string }>(load, {
      immediate: true,
      poll,
      pollIntervalMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(state.value).toBe('normal')

    // 第一次执行返回 accepted 进入轮询
    load.mockResolvedValueOnce({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } })
    await execute()
    expect(state.value).toBe('loading')

    // refresh 中断轮询并重新加载（completed）
    await refresh()
    expect(state.value).toBe('normal')

    await vi.advanceTimersByTimeAsync(5000)
    expect(poll).not.toHaveBeenCalled()
    stopPolling()
  })
})