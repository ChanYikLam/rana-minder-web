import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useDebouncedSearch } from './useDebouncedSearch'

type SearchHandler = (kw: string) => Promise<void> | void

const Harness = defineComponent({
  props: {
    onSearch: { type: Function, required: true },
  },
  setup(props) {
    const { searching, seq, schedule, cancel } = useDebouncedSearch({
      onSearch: (kw) => (props.onSearch as SearchHandler)(kw),
    })
    return { searching, seq, schedule, cancel }
  },
  render() { return null },
})

interface HarnessVm {
  schedule: (kw: string) => void
  cancel: () => void
  searching: boolean
  seq: number
}

function mountHarness(onSearch: SearchHandler) {
  const wrapper = mount(Harness, { props: { onSearch } })
  return { wrapper, vm: wrapper.vm as unknown as HarnessVm }
}

describe('useDebouncedSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('防抖：连续输入只触发一次搜索（300ms 窗口重置）', () => {
    const onSearch = vi.fn()
    const { vm } = mountHarness(onSearch)
    vm.schedule('a')
    vi.advanceTimersByTime(100)
    vm.schedule('ab')
    vi.advanceTimersByTime(299)
    expect(onSearch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('ab')
  })

  it('空关键字与纯空格：立即触发重置且不再发请求', () => {
    const onSearch = vi.fn()
    const { vm } = mountHarness(onSearch)
    vm.schedule('')
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenLastCalledWith('')
    vi.advanceTimersByTime(500)
    expect(onSearch).toHaveBeenCalledTimes(1)

    vm.schedule('   ')
    expect(onSearch).toHaveBeenCalledTimes(2)
    expect(onSearch).toHaveBeenLastCalledWith('')
  })

  it('关键字 trim 后传入搜索回调', () => {
    const onSearch = vi.fn()
    const { vm } = mountHarness(onSearch)
    vm.schedule('  张三  ')
    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenCalledWith('张三')
  })

  it('searching 覆盖防抖窗口并在请求完成后复位', async () => {
    let resolveFn!: () => void
    const { vm } = mountHarness(
      () => new Promise<void>((resolve) => { resolveFn = resolve }),
    )
    vm.schedule('a')
    expect(vm.searching).toBe(true)
    vi.advanceTimersByTime(300)
    expect(vm.searching).toBe(true)
    resolveFn()
    await Promise.resolve()
    expect(vm.searching).toBe(false)
  })

  it('在途请求被新输入作废：seq 机制生效，loading 由最新请求复位', async () => {
    const resolvers: Array<() => void> = []
    const onSearch = vi.fn(() => {
      return new Promise<void>((resolve) => { resolvers.push(resolve) })
    })
    const { vm } = mountHarness(onSearch)

    vm.schedule('a')
    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenCalledTimes(1)
    vm.schedule('ab')
    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenCalledTimes(2)

    // 旧请求完成：loading 保持 true（最新请求未完成）
    resolvers[0]()
    await Promise.resolve()
    expect(vm.searching).toBe(true)

    // 新请求完成：loading 复位
    resolvers[1]()
    await Promise.resolve()
    expect(vm.searching).toBe(false)
  })

  it('清空关键字立即作废在途请求并复位 loading', async () => {
    const resolvers: Array<() => void> = []
    const { vm } = mountHarness(() => {
      return new Promise<void>((resolve) => { resolvers.push(resolve) })
    })

    vm.schedule('a')
    vi.advanceTimersByTime(300)
    vm.schedule('')
    expect(vm.searching).toBe(false)

    // 旧请求完成：不影响（seq 已递增）
    resolvers[0]()
    await Promise.resolve()
    expect(vm.searching).toBe(false)
  })

  it('卸载时清理待触发定时器，不再发请求', () => {
    const onSearch = vi.fn()
    const { wrapper, vm } = mountHarness(onSearch)
    vm.schedule('a')
    vi.advanceTimersByTime(100)
    wrapper.unmount()
    vi.advanceTimersByTime(1000)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('onSearch 异常不导致 loading 卡死', async () => {
    const { vm } = mountHarness(() => { throw new Error('boom') })
    vm.schedule('a')
    vi.advanceTimersByTime(300)
    await Promise.resolve()
    expect(vm.searching).toBe(false)
  })

  it('空关键字重置同步抛错不产生未处理拒绝', async () => {
    const { vm } = mountHarness((kw) => { if (!kw) throw new Error('boom-empty') })
    vm.schedule('')
    await Promise.resolve()
    expect(vm.searching).toBe(false)
  })

  it('空关键字重置返回拒绝 Promise 不产生未处理拒绝', async () => {
    const { vm } = mountHarness(
      (kw) => kw ? Promise.resolve() : Promise.reject(new Error('boom-reject')),
    )
    vm.schedule('')
    await Promise.resolve()
    expect(vm.searching).toBe(false)
  })

  it('旧响应被丢弃不写回：页面级 seq 守卫', async () => {
    const resolvers: Array<() => void> = []
    const results: string[] = []
    const capturedSeqs: number[] = []

    const { vm } = mountHarness((kw) => {
      capturedSeqs.push(vm.seq)
      const idx = capturedSeqs.length - 1
      return new Promise<void>((resolve) => {
        resolvers.push(() => {
          if (capturedSeqs[idx] === vm.seq) {
            results.push(kw)
          }
          resolve()
        })
      })
    })

    vm.schedule('first')
    vi.advanceTimersByTime(300)
    vm.schedule('second')
    vi.advanceTimersByTime(300)

    // 第一个请求完成：应被丢弃
    resolvers[0]()
    await Promise.resolve()
    expect(results).toEqual([])

    // 第二个请求完成：应写回
    resolvers[1]()
    await Promise.resolve()
    expect(results).toEqual(['second'])
  })

  it('cancel 后新请求覆写：筛选变化场景（PublicCatalogPage 模式）', async () => {
    const resolvers: Array<() => void> = []
    const results: string[] = []
    const capturedSeqs: number[] = []

    const { vm } = mountHarness((kw) => {
      capturedSeqs.push(vm.seq)
      const idx = capturedSeqs.length - 1
      return new Promise<void>((resolve) => {
        resolvers.push(() => {
          if (capturedSeqs[idx] === vm.seq) {
            results.push(kw)
          }
          resolve()
        })
      })
    })

    // 模拟：搜索在途 → 筛选变化（cancel + schedule）→ 旧响应丢弃 → 新响应写回
    vm.schedule('keyword-a')
    vi.advanceTimersByTime(300)
    expect(vm.searching).toBe(true)

    // 筛选变化：取消待触发定时器，立即发起新请求
    vm.cancel()
    vm.schedule('keyword-b')
    vi.advanceTimersByTime(300)

    // 旧请求完成：应被丢弃
    resolvers[0]()
    await Promise.resolve()
    expect(results).toEqual([])

    // 新请求完成：应写回
    resolvers[1]()
    await Promise.resolve()
    expect(results).toEqual(['keyword-b'])
  })
})
