import { describe, expect, it, vi, beforeEach } from 'vitest'
import { toast } from 'vue-sonner'
import { toastAcceptedAction, ACCEPTED_LOAD_MESSAGE } from './acceptedResult'

vi.mock('vue-sonner', () => ({
  toast: { info: vi.fn() },
}))

describe('toastAcceptedAction 操作类 accepted 提示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('使用默认文案提示已受理', () => {
    toastAcceptedAction()
    expect(toast.info).toHaveBeenCalledWith('操作已受理，正在后台处理，请稍后刷新查看结果')
  })

  it('支持自定义文案', () => {
    toastAcceptedAction('发布已受理，正在后台处理')
    expect(toast.info).toHaveBeenCalledWith('发布已受理，正在后台处理')
  })
})

describe('ACCEPTED_LOAD_MESSAGE 加载类 accepted 文案', () => {
  it('提供可重试的加载中文案', () => {
    expect(ACCEPTED_LOAD_MESSAGE).toBe('数据正在生成中，请稍后重试')
  })
})
