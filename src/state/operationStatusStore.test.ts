import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOperationStatusStore } from './operationStatusStore'

describe('operationStatusStore 操作状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('startOperation 后进入 pending', () => {
    const store = useOperationStatusStore()
    expect(store.isOperationPending('key-1')).toBe(false)
    store.startOperation('key-1', 'publish')
    expect(store.isOperationPending('key-1')).toBe(true)
    expect(store.pendingOperations.get('key-1')).toEqual({ action: 'publish', startedAt: new Date('2026-08-07T12:00:00Z').getTime() })
  })

  it('finishOperation 清除 pending 并记录结果', () => {
    const store = useOperationStatusStore()
    store.startOperation('key-1', 'publish')
    store.finishOperation('key-1', true, '发布成功')
    expect(store.isOperationPending('key-1')).toBe(false)
    expect(store.lastOperationResult).toEqual({ success: true, message: '发布成功' })
  })

  it('finishOperation 支持失败结果', () => {
    const store = useOperationStatusStore()
    store.startOperation('key-1', 'publish')
    store.finishOperation('key-1', false, '权限不足')
    expect(store.lastOperationResult).toEqual({ success: false, message: '权限不足' })
  })

  it('clearLastResult 清空最近结果', () => {
    const store = useOperationStatusStore()
    store.finishOperation('key-1', true, 'ok')
    store.clearLastResult()
    expect(store.lastOperationResult).toBeNull()
  })
})
