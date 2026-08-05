import { getCurrentInstance, onUnmounted, ref, type Ref } from 'vue'

export interface UseDebouncedSearchOptions {
  /** 防抖窗口，默认 300ms */
  delay?: number
  /**
   * 搜索回调：keyword 为 trim 后的关键字（空字符串表示清空关键字，应立即重置结果）。
   * 调用方应在异步操作前捕获 mySeq = seq.value，操作后比较 mySeq !== seq.value 判断是否作废。
   */
  onSearch: (keyword: string) => Promise<void> | void
}

export interface UseDebouncedSearchReturn {
  /** 搜索中（覆盖防抖窗口 + 请求在途），用于 loading 展示与空态文案抑制 */
  searching: Ref<boolean>
  /**
   * 当前代次号（只读，调用方不得修改）。
   * 每次输入变化、清空或卸载时递增。调用方必须在 onSearch 入口处立即捕获 mySeq = seq.value，
   * 异步操作后比较 mySeq !== seq.value 判断是否被作废。严禁在 onSearch 内自增 seq（如 ++seq.value），
   * 否则将被 composable 内部的 searching 复位逻辑误判为 stale。
   */
  seq: Ref<number>
  /** 输入变化时调用（含清空）；空关键字立即作废在途请求并同步触发 onSearch('')。immediate=true 跳过防抖立即执行 */
  schedule: (keyword: string, immediate?: boolean) => void
  /** 取消待触发的防抖定时器（不清空 searching，不触发 onSearch） */
  cancel: () => void
}

/**
 * 防抖搜索控制器：统一 300ms 防抖、在途请求作废（代次号）、卸载清理与 loading 状态。
 * 页面仅需提供 onSearch 处理业务状态（结果写入/失败提示），无需自行维护 timer/序号。
 * onSearch 内不得修改 seq（如 ++seq.value），仅允许捕获 mySeq = seq.value 后比较。
 */
export function useDebouncedSearch(options: UseDebouncedSearchOptions): UseDebouncedSearchReturn {
  const delay = options.delay ?? 300
  const searching = ref(false)
  const seq = ref(0)
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule(keyword: string, immediate = false) {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const kw = keyword.trim()
    if (!kw) {
      // 空关键字：立即作废在途请求（旧响应不再生效），同步清空
      seq.value++
      searching.value = false
      try {
        const result = options.onSearch('')
        if (result instanceof Promise) {
          result.catch((e) => {
            console.error('[useDebouncedSearch] onSearch 执行失败:', e)
          })
        }
      } catch (e) {
        console.error('[useDebouncedSearch] onSearch 执行失败:', e)
      }
      return
    }
    // 输入变化立即递增序号：防抖窗口内到达的旧响应将被 seq 比较识别为作废
    seq.value++
    searching.value = true
    if (immediate) {
      // 立即执行（重试等场景），不经过防抖
      const mySeq = seq.value
      void (async () => {
        try {
          await options.onSearch(kw)
        } catch (e) {
          console.error('[useDebouncedSearch] onSearch 执行失败:', e)
        } finally {
          if (mySeq === seq.value) searching.value = false
        }
      })()
      return
    }
    timer = setTimeout(() => {
      timer = null
      const mySeq = seq.value
      void (async () => {
        try {
          await options.onSearch(kw)
        } catch (e) {
          console.error('[useDebouncedSearch] onSearch 执行失败:', e)
        } finally {
          // 仅当无更新的输入（未被作废）时复位 loading，避免误清新请求的 loading 状态
          if (mySeq === seq.value) searching.value = false
        }
      })()
    }, delay)
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function cleanup() {
    cancel()
    seq.value++
    searching.value = false
  }

  // 组件挂载场景自动注册卸载清理；无实例（独立测试）时由测试方自行管理
  const instance = getCurrentInstance()
  if (instance) onUnmounted(cleanup)

  return { searching, seq, schedule, cancel }
}