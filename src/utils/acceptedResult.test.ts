import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockToastInfo } = vi.hoisted(() => ({ mockToastInfo: vi.fn() }))
vi.mock('vue-sonner', () => ({
  toast: { info: (...args: unknown[]) => mockToastInfo(...args), success: vi.fn(), error: vi.fn() },
}))

import { toastAcceptedAction, ACCEPTED_LOAD_MESSAGE } from './acceptedResult'

describe('acceptedResult 异步受理结果统一处理', () => {
  beforeEach(() => {
    mockToastInfo.mockReset()
    vi.clearAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  it('toastAcceptedAction：默认文案提示"已受理"', () => {
    toastAcceptedAction()
    expect(mockToastInfo).toHaveBeenCalledTimes(1)
    expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('已受理'))
  })

  it('toastAcceptedAction：支持自定义文案', () => {
    toastAcceptedAction('换届执行已受理，正在后台处理')
    expect(mockToastInfo).toHaveBeenCalledWith('换届执行已受理，正在后台处理')
  })

  it('ACCEPTED_LOAD_MESSAGE：加载类受理提示文案', () => {
    expect(ACCEPTED_LOAD_MESSAGE).toContain('请稍后重试')
  })
})
