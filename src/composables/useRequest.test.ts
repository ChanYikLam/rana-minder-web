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
    // 超时文案独立于无 poll 时的“处理中”降级错误，明确为失败态
    expect(error.value?.code).toBe('IFC-ERR-014')
    expect(error.value?.message).toBe('任务处理超时，请稍后重试')

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

  it('补跑期间又有新 execute 入队：早先 waiters 等待整个补跑链结束才 resolve', async () => {
    // 场景：第一次 execute 在途时两个 waiter 入队（p2/p3）；补跑在途时又一个 waiter（p4）入队，
    // 触发再次补跑。早先的 p2/p3 不应在“倒数第二次”补跑结束就 resolve，而应等到整条链结束。
    const flush = () => new Promise((r) => setTimeout(r, 0))
    let firstResolve: (r: ApiResult<{ id: string }>) => void = () => {}
    let secondResolve: (r: ApiResult<{ id: string }>) => void = () => {}
    let thirdResolve: (r: ApiResult<{ id: string }>) => void = () => {}
    let call = 0
    const fn = vi.fn(() => {
      call += 1
      if (call === 1) return new Promise<ApiResult<{ id: string }>>((resolve) => { firstResolve = resolve })
      if (call === 2) return new Promise<ApiResult<{ id: string }>>((resolve) => { secondResolve = resolve })
      return new Promise<ApiResult<{ id: string }>>((resolve) => { thirdResolve = resolve })
    })
    const { execute, state } = useRequest<{ id: string }>(fn)

    // 第一次调用在途，p2/p3 入队
    const p1 = execute()
    const p2 = execute()
    const p3 = execute()
    expect(fn).toHaveBeenCalledTimes(1)

    // 第一次完成触发补跑，并让补跑（call=2）启动进入在途
    firstResolve({ kind: 'completed', data: { id: 'x' } })
    await flush()
    expect(fn).toHaveBeenCalledTimes(2)

    // 补跑在途时 p4 又入队（此时 running=true，p4 进入等待而非触发新补跑）
    const p4 = execute()

    let p2Resolved = false
    let p3Resolved = false
    let p4Resolved = false
    void p2.then(() => { p2Resolved = true })
    void p3.then(() => { p3Resolved = true })
    void p4.then(() => { p4Resolved = true })
    await flush()
    // 补跑（call=2）仍处于是途，所有 waiters 均未 resolve
    expect(p2Resolved).toBe(false)
    expect(p3Resolved).toBe(false)
    expect(p4Resolved).toBe(false)
    expect(fn).toHaveBeenCalledTimes(2)

    // 第二次补跑完成，触发第三次补跑（call=3）；此时早先 waiters 仍不应 resolve
    secondResolve({ kind: 'completed', data: { id: 'y' } })
    await flush()
    expect(fn).toHaveBeenCalledTimes(3)
    expect(p2Resolved).toBe(false)
    expect(p3Resolved).toBe(false)

    // 第三次补跑完成后，所有 waiters 一并 resolve
    thirdResolve({ kind: 'completed', data: { id: 'z' } })
    await Promise.all([p1, p2, p3, p4])
    expect(p2Resolved).toBe(true)
    expect(p3Resolved).toBe(true)
    expect(p4Resolved).toBe(true)
    expect(state.value).toBe('normal')
  })

  it('轮询在途被 stopPolling 中断：过期结果不更新状态（代际 token）', async () => {
    vi.useFakeTimers()
    let resolvePoll: (r: ApiResult<{ id: string }>) => void = () => {}
    const poll = vi.fn(() => new Promise<ApiResult<{ id: string }>>((resolve) => { resolvePoll = resolve }))
    const { execute, state, error, stopPolling } = useRequest<{ id: string }>(async () => ({ kind: 'accepted', data: { taskId: 't1', status: 'processing' } }), {
      poll,
      pollIntervalMs: 1000,
    })

    await execute()
    expect(state.value).toBe('loading')

    // 推进到第一个 tick，poll 在途
    await vi.advanceTimersByTimeAsync(1000)
    expect(poll).toHaveBeenCalledTimes(1)

    // 在 poll 在途时 stopPolling（模拟 refresh/卸载），代际失效
    stopPolling()

    // 旧 poll 此刻返回 completed：代际已失效，结果应被丢弃，不更新状态
    resolvePoll({ kind: 'completed', data: { id: 'stale' } })
    await Promise.resolve()

    expect(state.value).toBe('loading')
    expect(error.value).toBeNull()

    // 新轮询未开启，定时器已清理，不再触发
    await vi.advanceTimersByTimeAsync(5000)
    expect(poll).toHaveBeenCalledTimes(1)
  })
})