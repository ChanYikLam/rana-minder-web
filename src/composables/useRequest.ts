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
/** 轮询超时的独立文案：区别于无 poll 时 accepted 的“处理中”降级错误，明确为失败态 */
const POLL_TIMEOUT_MESSAGE = '任务处理超时，请稍后重试'

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
  /**
   * 代际 token：每次 startPolling 自增并记录到本轮回调；stopPolling 也自增，
   * 使仍在途的旧 poll 回调在 await 返回后被判定为过期并丢弃，避免与新轮询并发更新状态。
   */
  let pollGeneration = 0
  let pollAttempts = 0

  function stopPolling() {
    // 自增代际使在途的异步 poll 回调失效
    pollGeneration += 1
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = null
    }
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
    // 本轮代际 token：stopPolling 已自增，再自增一次作为本轮 token
    pollGeneration += 1
    const gen = pollGeneration
    pollHandle = setInterval(async () => {
      if (!options.poll) return
      pollAttempts += 1
      try {
        if (pollAttempts > (options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS)) {
          // 超时：仅在代际仍有效时更新为超时错误
          if (gen === pollGeneration) {
            state.value = 'error'
            error.value = { code: 'IFC-ERR-014', message: POLL_TIMEOUT_MESSAGE }
          }
          stopPolling()
          return
        }
        const result = await options.poll()
        // 代际失效说明轮询已被中断（refresh/卸载/新轮询），丢弃过期结果
        if (gen !== pollGeneration) return
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
        if (gen === pollGeneration) {
          state.value = 'error'
          error.value = {
            code: 'IFC-ERR-016',
            message: e instanceof Error ? e.message : ERROR_MESSAGES['IFC-ERR-016'],
          }
        }
        stopPolling()
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
   * 并发合并队列：执行期间再次调用不静默丢弃，合并为一次补跑。
   * 等待者（waiters）的 resolve 挂在整个补跑链的终点，确保所有调用方
   * 拿到的是最终稳定的状态，不因补跑期间又有新的 execute() 入队而提前 resolve。
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
        // 将补跑链的完成串联到 waiters 的 resolve 上，等待整条补跑链结束
        return execute().finally(() => w.forEach((resolve) => resolve()))
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
