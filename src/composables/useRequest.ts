import { ref, type Ref } from 'vue'
import type { ApiResult } from '@/types/contracts'
import type { PageState } from '@/types/machine'
import { errorToPageState, ERROR_MESSAGES, type ErrorCode } from '@/services/error-map'

interface UseRequestOptions<T> {
  immediate?: boolean
  initialData?: T
  /**
   * 轮询函数：`accepted`/`external_uncertain` 时以 pollIntervalMs 间隔轮询任务状态，
   * 直到 `completed`（写入 data）或出现错误类结果（终止并呈现错误）。
   * 不传则上述两种结果直接呈现为 error 态（可重试），绝不永久卡 loading。
   */
  poll?: () => Promise<ApiResult<T>>
  pollIntervalMs?: number
  maxPollAttempts?: number
}

interface UseRequestReturn<T> {
  data: Ref<T | null>
  state: Ref<PageState>
  error: Ref<{ code: string; message: string; supportId?: string } | null>
  execute: () => Promise<void>
  refresh: () => Promise<void>
  /** 停止进行中的轮询（onBeforeUnmount 时调用，避免无主定时器） */
  stopPolling: () => void
}

const DEFAULT_POLL_INTERVAL_MS = 2000
const DEFAULT_MAX_POLL_ATTEMPTS = 30

export function useRequest<T>(
  fn: () => Promise<ApiResult<T>>,
  options: UseRequestOptions<T> = {}
): UseRequestReturn<T> {
  const data = ref<T | null>(options.initialData ?? null) as Ref<T | null>
  const state = ref<PageState>(options.immediate ? 'loading' : 'normal')
  const error = ref<{ code: string; message: string; supportId?: string } | null>(null)

  let running = false
  let pending = false
  let waiters: (() => void)[] = []
  let pollHandle: ReturnType<typeof setInterval> | null = null
  let pollingInFlight = false
  let pollAttempts = 0

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = null
    }
    pollingInFlight = false
    pollAttempts = 0
  }

  function applyResult(result: ApiResult<T>) {
    if (result.kind === 'completed') {
      data.value = result.data as T
      if (result.data && typeof result.data === 'object' && 'items' in result.data) {
        const items = (result.data as { items: unknown[] }).items
        state.value = items.length === 0 ? 'empty' : 'normal'
      } else {
        state.value = 'normal'
      }
      return
    }

    if (result.kind === 'accepted' || result.kind === 'external_uncertain') {
      if (options.poll) {
        state.value = 'loading'
        startPolling()
        return
      }
      // 无轮询配置：直接呈现为可重试的错误态，避免永久 loading
      if (result.kind === 'accepted') {
        state.value = 'error'
        error.value = { code: 'IFC-ERR-014', message: ERROR_MESSAGES['IFC-ERR-014'] }
      } else {
        state.value = 'error'
        error.value = {
          code: result.error.code,
          message: result.error.message,
          ...(result.error.supportId ? { supportId: result.error.supportId } : {}),
        }
      }
      return
    }

    const code = result.error.code as ErrorCode
    state.value = errorToPageState(code)
    error.value = { code: result.error.code, message: result.error.message, supportId: result.error.supportId }
  }

  function startPolling() {
    stopPolling()
    pollHandle = setInterval(async () => {
      if (pollingInFlight || !options.poll) return
      pollingInFlight = true
      pollAttempts += 1
      try {
        if (pollAttempts > (options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS)) {
          stopPolling()
          state.value = 'error'
          error.value = { code: 'IFC-ERR-014', message: ERROR_MESSAGES['IFC-ERR-014'] }
          return
        }
        const result = await options.poll()
        if (result.kind === 'completed') {
          stopPolling()
          applyResult(result)
          return
        }
        if (result.kind === 'accepted' || result.kind === 'external_uncertain') {
          return
        }
        stopPolling()
        applyResult(result)
      } catch (e) {
        stopPolling()
        state.value = 'error'
        error.value = {
          code: 'IFC-ERR-016',
          message: e instanceof Error ? e.message : ERROR_MESSAGES['IFC-ERR-016'],
        }
      } finally {
        pollingInFlight = false
      }
    }, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
  }

  async function runOnce(): Promise<void> {
    state.value = 'loading'
    error.value = null
    stopPolling()

    try {
      const result = await fn()
      applyResult(result)
    } catch (e) {
      state.value = 'error'
      error.value = {
        code: 'IFC-ERR-016',
        message: e instanceof Error ? e.message : ERROR_MESSAGES['IFC-ERR-016'],
      }
    }
  }

  /**
   * 并发合并队列：执行期间再次调用不静默丢弃，合并为一次补跑，
   * 所有等待调用在该次补跑完成后一并 resolve。
   */
  function execute(): Promise<void> {
    if (running) {
      pending = true
      return new Promise<void>((resolve) => waiters.push(resolve))
    }
    running = true
    const p = runOnce().finally(() => {
      running = false
      if (pending) {
        pending = false
        const w = waiters
        waiters = []
        void execute().finally(() => w.forEach((resolve) => resolve()))
      }
    })
    return p
  }

  async function refresh() {
    return execute()
  }

  if (options.immediate) {
    void execute()
  }

  return { data, state, error, execute, refresh, stopPolling }
}