import { getCurrentInstance, onUnmounted, ref, type Ref } from 'vue'

export interface UseDebouncedSearchOptions {
  /** 防抖窗口，默认 300ms */
  delay?: number
  /**
   * 搜索回调：keyword 为 trim 后的关键字（空字符串表示清空关键字，应立即重置结果）。
   * isStale() 返回当前请求是否已被作废（期间有更新的输入），作废后不应写回任何状态。
   */
  onSearch: (keyword: string, isStale: () => boolean) => Promise<void> | void
}

export interface UseDebouncedSearchReturn {
  /** 搜索中（覆盖防抖窗口 + 请求在途），用于 loading 展示与空态文案抑制 */
  searching: Ref<boolean>
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
  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  function schedule(keyword: string) {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const kw = keyword.trim()
    if (!kw) {
      // 空关键字：立即作废在途请求（旧响应不再生效），不发请求
      seq++
      searching.value = false
      void (async () => {
        try {
          await options.onSearch('', () => true)
        } catch (e) {
          // 与防抖分支一致：兜底避免浮空 Promise 的未处理拒绝
          console.error('[useDebouncedSearch] onSearch 执行失败:', e)
        }
      })()
      return
    }
    // 输入变化立即递增序号：防抖窗口内到达的旧响应将被 isStale() 识别为作废
    seq++
    searching.value = true
    timer = setTimeout(() => {
      timer = null
      const mySeq = ++seq
      void (async () => {
        try {
          await options.onSearch(kw, () => mySeq !== seq)
        } catch (e) {
          // onSearch 契约要求自行处理业务错误；此处兜底避免浮空 Promise 的未处理拒绝
          console.error('[useDebouncedSearch] onSearch 执行失败:', e)
        } finally {
          // 仅当无更新的输入（未被作废）时复位 loading，避免误清新请求的 loading 状态
          if (mySeq === seq) searching.value = false
        }
      })()
    }, delay)
  }

  function cleanup() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    seq++
    searching.value = false
  }

  // 组件挂载场景自动注册卸载清理；无实例（独立测试）时由测试方自行管理
  const instance = getCurrentInstance()
  if (instance) onUnmounted(cleanup)

  return { searching, schedule }
}
