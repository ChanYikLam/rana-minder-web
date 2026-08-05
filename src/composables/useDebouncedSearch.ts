import { getCurrentInstance, onUnmounted, ref, type Ref } from 'vue'

export interface UseDebouncedSearchOptions {
  /** 防抖窗口，默认 300ms */
  delay?: number
  /**
   * 搜索回调：keyword 为 trim 后的关键字（空字符串表示清空关键字，应立即重置结果）。
   * 调用方在异步操作前捕获 const mySeq = seq.value，操作后比较 mySeq !== seq.value 判断是否被作废。
   */
  onSearch: (keyword: string) => Promise<void> | void
}

export interface UseDebouncedSearchReturn {
  /** 搜索中（覆盖防抖窗口 + 请求在途），用于 loading 展示与空态文案抑制 */
  searching: Ref<boolean>
  /** 当前请求序号。调用方在 onSearch 内捕获 mySeq = seq.value，异步操作后比较 mySeq !== seq.value 判断是否被作废 */
  seq: Ref<number>
  /** 输入变化时调用（含清空）；空关键字立即作废在途请求并同步触发 onSearch('') */
  schedule: (keyword: string) => void
}

/**
 * 防抖搜索控制器：统一 300ms 防抖、在途请求作废（请求序号）、卸载清理与 loading 状态。
 * 页面仅需提供 onSearch 处理业务状态（结果写入/失败提示），无需自行维护 timer/序号。
 */
export function useDebouncedSearch(options: UseDebouncedSearchOptions): UseDebouncedSearchReturn {
  const delay = options.delay ?? 300
  const searching = ref(false)
  const seq = ref(0)
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule(keyword: string) {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const kw = keyword.trim()
    if (!kw) {
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
    seq.value++
    searching.value = true
    timer = setTimeout(() => {
      timer = null
      const mySeq = ++seq.value
      void (async () => {
        try {
          await options.onSearch(kw)
        } catch (e) {
          console.error('[useDebouncedSearch] onSearch 执行失败:', e)
        } finally {
          if (mySeq === seq.value) searching.value = false
        }
      })()
    }, delay)
  }

  function cleanup() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    seq.value++
    searching.value = false
  }

  const instance = getCurrentInstance()
  if (instance) onUnmounted(cleanup)

  return { searching, seq, schedule }
}